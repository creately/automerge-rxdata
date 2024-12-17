import mingo from 'mingo';
import Loki from 'lokijs';
import isequal from "lodash/isequal";
import cloneDeep from "lodash/cloneDeep";
import omit from 'lodash/omit';
import { Observable, Subject, empty, of, defer, from, Subscription } from 'rxjs';
import { switchMap, concatMap, concat, map, distinctUntilChanged } from 'rxjs/operators';
import { modify } from '@creately/mungo';
import { Channel } from './channel';
import { DocumentChange, ErrCollectionClosed, FindOptions, IDocument, Modifier, Selector } from './types';

// Collection
// Collection ...?
export class CollectionLoki<T extends IDocument> {
  public static loki = new Loki('rxdatalokijs');
  // allDocs
  // allDocs emits all documents in the collection when they get modified.
  protected allDocs: Subject<T[]>;

  // storage
  // storage stores documents in a suitable storage backend.
  protected storage: Loki.Collection;

  // channel
  // channel sends/receives messages between browser tabs.
  protected changes: Channel<DocumentChange<T>>;

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

  // constructor
  constructor(public name: string) {
    this.allDocs = new Subject();
    this.storage = CollectionLoki.loki.addCollection(name);
    this.changes = Channel.create(`rxdata.${name}.channel`);
    this.changesSub = this.changes.pipe(concatMap(change => from(this.apply(change)))).subscribe();
  }

  // close
  // close stops all collection activities and disables all public methods.
  public close() {
    this.allDocs.error(ErrCollectionClosed);
    this.changesSub.unsubscribe();
    ['close', 'watch', 'find', 'findOne', 'insert', 'update', 'remove'].forEach(name => {
      (this as any)[name] = () => {
        throw ErrCollectionClosed;
      };
    });
  }

  // watch
  // watch watches for modified documents in the collection and emits
  // when they change. Accepts an optional selector to only watch changes
  // made to documents which match the selector.
  public watch(selector?: Selector): Observable<DocumentChange<T>> {
    if (!selector) {
      return this.changes.asObservable().pipe(
        map(change => {
          const docs = change.docs.map(doc => omit(doc, '$loki', 'meta'));
          return Object.assign({}, change, { docs });
        })
      );
    }
    const mq = new mingo.Query(selector);
    return this.changes.pipe(
      switchMap(change => {
        const docs = change.docs.filter(doc => mq.test(doc)).map(doc => omit(doc, '$loki', 'meta'));
        if (!docs.length) {
          return empty();
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
        concat(this.allDocs),
        map(docs => this.filter(docs, selector, options)),
        distinctUntilChanged(isequal)
      )
    );
  }

  // find
  // find returns an observable of a document which matches the given
  // selector and filter options (both are optional). The observable
  // re-emits whenever the result value changes.
  public findOne(selector: Selector = {}, options: FindOptions = {}): Observable<T> {
    options.limit = 1;
    return defer(() =>
      from(this.load()).pipe(
        concat(this.allDocs),
        map(docs => this.filter(docs, selector, options)[0] || null),
        distinctUntilChanged(isequal)
      )
    );
  }

  // insert
  // insert inserts a new document into the collection. If a document
  // with the id already exists in the collection, it will be replaced.
  public async insert(docOrDocs: T | T[]): Promise<void> {
    const docs: T[] = cloneDeep(Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs]);
    docs.forEach(doc => {
      var existingDoc = this.storage.findOne({ id: doc.id });
      if (existingDoc) {
        // If a matching document exists, update it
        Object.assign(existingDoc, doc);
        this.storage.update(existingDoc);
      } else {
        // If no matching document exists, insert the new document
        this.storage.insert(doc);
      }
    });
    await this.emitAndApply({ id: this.nextChangeId(), type: 'insert', docs: docs });
  }

  // update
  // update modifies existing documents in the collection which passes
  // the given selector.
  public async update(selector: Selector, _modifier: Modifier): Promise<void> {
    const modifier = cloneDeep(_modifier);
    const filter = this.createFilter(selector);
    const docs: T[] = cloneDeep((await this.load()).filter(doc => filter(doc)));
    docs.forEach(doc => {
      modify(doc, modifier);
      this.storage.update(doc);
    });
    await this.emitAndApply({ id: this.nextChangeId(), type: 'update', docs: docs, modifier: modifier });
  }

  // remove
  // remove removes existing documents in the collection which passes
  // the given selector.
  public async remove(selector: Selector): Promise<void> {
    const filter = this.createFilter(selector);
    const docs = (await this.load()).filter(doc => filter(doc));
    docs.map(doc => this.storage.remove(doc));
    await this.emitAndApply({ id: this.nextChangeId(), type: 'remove', docs: docs });
  }

  public async dropCollection() {
    CollectionLoki.loki.removeCollection(this.name);
    await this.reload();
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
    return cursor.all().map((doc: any) => omit(doc, '$loki', 'meta'));
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
    return Promise.resolve(this.storage.data);
  }

  // Reload
  // Reload loads all document from storage, update
  // the cachedDocs and emit the updated docs.
  public async reload() {
    return this.loadAll().then(docs => {
      this.allDocs.next(docs);
    });
  }

  // loadAll
  // loadAll loads all documents from storage without filtering.
  // Returns a promise which resolves to an array of documents.
  protected async loadAll(): Promise<T[]> {
    return Promise.resolve(this.storage.data);
  }

  // refresh
  // refresh loads all documents from localForage storage and emits it
  // to all listening queries. Called when the collection gets changed.
  protected async apply(change: DocumentChange<T>) {
    this.allDocs.next(this.storage.data);
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
    await new Promise(resolve => {
      this.changeResolve[change.id] = resolve as any;
      this.changes.next(change);
    });
  }
}
