import mingo from 'mingo';
import isequal from "lodash/isequal";
import cloneDeep from "lodash/cloneDeep";
import { Observable, Subject, of, defer, from, Subscription, EMPTY, concat as concatC } from 'rxjs';
import { switchMap, map, concat, distinctUntilChanged, concatMap, debounceTime, tap } from 'rxjs/operators';
import { DocHandle, Repo } from '@automerge/automerge-repo';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { applyMongoModifier, automergePatchesToMongoModifier, removeUndefined } from './helpers';
import { DocumentChange, ErrCollectionClosed, FindOptions, IDocument, Modifier, Selector } from './types';

// Collection
// Collection ...?
export class CollectionAutomerge<T extends IDocument> {

  // cachedDocs
  // cachedDocs is an in memory cache of all documents in the database.
  protected cachedDocs: T[] | null = null;

  // allDocs
  // allDocs emits all documents in the collection when they get modified.
  protected allDocs: Subject<T[]>;

  // storage
  // storage stores documents in a suitable storage backend.
  //   protected storage: Loki.Collection;

  // channel
  // channel sends/receives messages between browser tabs.
  protected changes: Subject<DocumentChange<T>>;

  // changesSub
  // changesSub is the subscription created to listen to changes.
  protected changesSub: Subscription;

  // loadPromise
  // loadPromise is the promise which loads all documents form indexed db.
  protected loadPromise: Promise<T[]> | null = null;

  // lastChangeId
  // lastChangeId is the id used to create the last collection change
  protected lastChangeId: number = 0;

  // changeResolve
  // changeResolve a msp of change ids to their resolve functions.
  protected changeResolve: { [changeId: string]: () => void } = {};

  protected idsMap = {} as any;

  // Following documents are not supposed to sync
  // e.g. home project
  protected noSyncIdsMap = {} as any;

  // localRepo is to handle no sync documents
  protected localRepo: any = undefined;

  protected subsMap: any = {};
  

  // constructor
  constructor(public name: string, protected repo?: any) {
    this.allDocs = new Subject();
    this.changes = new Subject();
    this.changesSub = this.changes.pipe(concatMap((change: any) => from(this.apply(change)))).subscribe();
    const storage = new IndexedDBStorageAdapter(`automergeRxdata`);
    this.localRepo = new Repo({ storage });
  }

  // close
  // close stops all collection activities and disables all public methods.
  public close() {
    this.allDocs.error(ErrCollectionClosed);
    this.changesSub.unsubscribe();
    ['close', 'watch', 'find', 'findOne', 'insert', 'update', 'remove'].forEach((name) => {
      (this as any)[name] = () => {
        throw ErrCollectionClosed;
      };
    });
  }

  public getRepo( id: string ) {
    if ( this.noSyncIdsMap[ id ]) {
      return this.localRepo;
    }
    return this.repo;
  }

  // watch
  // watch watches for modified documents in the collection and emits
  // when they change. Accepts an optional selector to only watch changes
  // made to documents which match the selector.
  public watch(selector?: Selector): Observable<DocumentChange<T>> {
    if (!selector) {
      return this.changes.asObservable();
    }
    const mq = new mingo.Query(selector);
    return (this.changes).pipe(
      switchMap((change) => {
        const docs = change.docs.filter((doc: any) => mq.test(doc));
        if (!docs.length) {
          return EMPTY;
        }
        return of(Object.assign({}, change, { docs }));
      })
    );
  }

  // find
  // find returns an observable of documents which matches the given
  // selector and filter options (both are optional). The observable
  // re-emits whenever the result value changes.
  public find(selector: Selector = {}, options: FindOptions = {}): Observable<T[]> {
    return defer(() =>
      from(this.load()).pipe(
        concat(this.allDocs.pipe(debounceTime(0))),
        map((docs: any) => this.filter(docs, selector, options)),
        distinctUntilChanged(isequal),
      )
    );
  }

  // find
  // find returns an observable of a document which matches the given
  // selector and filter options (both are optional). The observable
  // re-emits whenever the result value changes.
  public findOne(selector: Selector = {}, options: FindOptions = {}): Observable<T> {
    options.limit = 1;
    return defer(() => {
        const all = from(this.load());
        return concatC( all, this.allDocs ).pipe(
            map((docs: any) => this.filter(docs, selector, options)[0] || null),
            distinctUntilChanged(isequal),
        );
    });
    // return defer(() =>
    //     from(this.load()).pipe(
    //       concat(this.allDocs.pipe(debounceTime(0))),
    //       map((docs: any) => this.filter(docs, selector, options)[0] || null),
    //       distinctUntilChanged(isequal),
    //     )
    //   );
  }

  public async initDocumentSync( docId: string, automergeId: string ) {
    if ( this.subsMap[ automergeId ]) {
        return;
    }
    const repo = this.getRepo( docId );
    const docHandle = repo.find(automergeId);
    await docHandle.whenReady();
    const handler = (d: any) => {
        const modifier = automergePatchesToMongoModifier(d.patches);
        this.emitAndApply({ id: this.nextChangeId(), type: 'update', docs: [d.doc], modifier: modifier });
    }
    docHandle.on('change', handler );
    this.subsMap[ automergeId ] = handler;

    this.idsMap[ docId ] = automergeId;
    const doc = await docHandle.doc();
    this.apply({ id: this.nextChangeId(), type: 'update', docs: [doc]});
  }

  // insert
  // insert inserts a new document into the collection. If a document
  // with the id already exists in the collection, it will be replaced.
  public async insert(docOrDocs: T | T[], noSync = false ): Promise<void> {
    let repo = this.repo as Repo;
    const docs: T[] = cloneDeep(Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs]);
    for (const _doc of docs) {
        if ( noSync ) {
            this.noSyncIdsMap[ _doc.id] = true;
            repo = this.localRepo;
        }
        const doc = removeUndefined( _doc );
        const automergeId = this.idsMap[doc.id];
        if (automergeId) {
        //   const docHandle = await this.getDochandle( repo, automergeId );
          const docHandle = repo.find( automergeId );
          await docHandle.whenReady();
          docHandle.change((dd: any) => {
            Object.assign(dd, doc);
          });
        }
        if (!automergeId && noSync ) {
          await this.createAutomergeDoc(doc);
        }
    }
  }

  protected async waitUntillDochandleReady( docHandle: DocHandle<any> ) {
    let attempt = 0;
    while ( !docHandle.isReady() ) {
      if ( attempt > 3 ) {
        throw new Error( 'Could not find doc handle ready..' + docHandle.documentId );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempt++;
    }
  }

  // update
  // update modifies existing documents in the collection which passes
  // the given selector.
  public async update(selector: Selector, _modifier: Modifier): Promise<void> {
    const modifier = cloneDeep(_modifier);
    if (selector.id && this.idsMap[selector.id]) {
        const automergeId = this.idsMap[selector.id];
        const repo = this.getRepo( selector.id );
        const docHandle = repo.find(automergeId);
        await docHandle.whenReady();
        docHandle.change((d: T) => applyMongoModifier(d, modifier));
        await docHandle.doc();
    } else {
        const filter = this.createFilter(selector);
        const docs: T[] = cloneDeep((await this.load()).filter((doc) => filter(doc)));
        for (const _doc of docs) {
            const automergeId = this.idsMap[_doc.id];
            const repo = this.getRepo( _doc.id );
            const docHandle = repo.find(automergeId);
            await docHandle.whenReady();
            if (docHandle) {
                docHandle.change((d: T) => applyMongoModifier(d, modifier));
                await docHandle.doc();
            }
        }
    }

  }

  // remove
  // remove removes existing documents in the collection which passes
  // the given selector.
  public async remove(selector: Selector): Promise<void> {
    const filter = this.createFilter(selector);
    const docs = (await this.load()).filter((doc) => filter(doc));
    for( const d of docs ) {
        const automergeId = this.idsMap[d.id];
        if (automergeId) {
            const repo = this.getRepo( d.id );
            if ( this.subsMap[automergeId] ) {
                const docHandle = repo.find(automergeId);
                docHandle.off( 'change', this.subsMap[automergeId]);
                delete this.subsMap[automergeId];
            }
            repo.delete(automergeId);
        }
    }
    await this.emitAndApply({ id: this.nextChangeId(), type: 'remove', docs: docs });
  }

  public async dropCollection() {
    console.log( 'Dropping Automerge collection is not impemented in client side' );
  }

  // filter
  // filter returns an array of documents which match the selector and
  // filter options. The selector, options and all option fields are optional.
  protected filter(docs: T[], selector: Selector, options: FindOptions): T[] {
    let cursor = mingo.find(docs, selector);
    if (options.sort) {
      cursor = cursor.sort(options.sort);
    }
    if (options.skip) {
      cursor = cursor.skip(options.skip);
    }
    if (options.limit) {
      cursor = cursor.limit(options.limit);
    }
    return cursor.all() as any;
  }

  protected async createAutomergeDoc(doc: T) {
    const docHandleLocal = this.localRepo.create(doc);
    await docHandleLocal.whenReady();
    const automergeId = docHandleLocal.documentId;
    this.idsMap[doc.id] = automergeId;
    const handler = (d: any) => {
        const modifier = automergePatchesToMongoModifier(d.patches);
        this.emitAndApply({ id: this.nextChangeId(), type: 'update', docs: [d.doc], modifier: modifier });
    }
    docHandleLocal.on('change',  handler );
    this.subsMap[ automergeId ] = handler;
    this.apply({ id: this.nextChangeId(), type: 'insert', docs: [doc] });
  }

  // createFilter
  // createFilter creates a document filter function from a selector.
  protected createFilter(selector: Selector): (doc: T) => boolean {
    const mq = new mingo.Query(selector);
    return (doc: T) => mq.test(doc);
  }

  // load
  // load loads all documents from the database to the in-memory cache.
  protected load(): Promise<T[]> {
    if (this.cachedDocs) {
        return Promise.resolve(this.cachedDocs);
      }
      if (!this.loadPromise) {
        this.loadPromise = this.loadAll().then(docs => (this.cachedDocs = docs));
      }
      return this.loadPromise.then(() => this.cachedDocs as T[]);
  }

  // Reload
  // Reload loads all document from storage, update
  // the cachedDocs and emit the updated docs.
  public async reload() {
    return this.loadAll().then((docs) => {
      this.allDocs.next(docs);
    });
  }

  // loadAll
  // loadAll loads all documents from storage without filtering.
  // Returns a promise which resolves to an array of documents.
  protected async loadAll(): Promise<T[]> {
    const array: T[] = [];
    for (const docId in this.idsMap) {
      const repo = this.getRepo( docId );
      const docHandle = repo.find(this.idsMap[docId]);
      if (docHandle) {
        array.push(await docHandle.doc());
      }
    }
    return array;
  }

  // refresh
  // refresh loads all documents from localForage storage and emits it
  // to all listening queries. Called when the collection gets changed.
  protected async apply(change: DocumentChange<T>) {
    if (!this.cachedDocs) {
      this.cachedDocs = await this.load();
    }
    if (change.type === 'insert' || change.type === 'update') {
      for (const doc of change.docs) {
        const index = this.cachedDocs.findIndex((d) => d.id === doc.id);
        if (index === -1) {
          this.cachedDocs.push(doc);
        } else {
          this.cachedDocs[index] = doc;
        }
      }
    } else if (change.type === 'remove') {
      for (const doc of change.docs) {
        const index = this.cachedDocs.findIndex((d) => d.id === doc.id);
        if (index !== -1) {
          this.cachedDocs.splice(index, 1);
        }
      }
    }
    this.allDocs.next(this.cachedDocs);
    const resolveFn = this.changeResolve[change.id];
    if (resolveFn) {
      resolveFn();
      delete this.changeResolve[change.id];
    }
  }

  // nextChangeId
  // nextChangeId returns the next change id.
  private nextChangeId(): number {
    return ++this.lastChangeId;
  }

  // emitAndApply
  // emitAndApply emits the change and waits until it is applied.
  private async emitAndApply(change: DocumentChange<T>): Promise<void> {
    this.changes.next(change);
  }
}
