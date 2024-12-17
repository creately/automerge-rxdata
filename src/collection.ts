import { Observable, EMPTY } from 'rxjs';
import { CollectionAutomerge } from './collection-automerge';
import { CollectionLoki } from './collection-loki';
import { CollectionPersistence } from './collection-persistence';
import { DocumentChange, FindOptions, IDocument, Modifier, Selector } from './types';

// Collection
// Collection ...?
export class Collection<T extends IDocument> {

  // constructor
  constructor( public name: string, opt: any = {} ) {
    // return new CollectionLoki( name );
    if ( opt.repo ) {
        return new CollectionAutomerge( name, opt.repo );
    } else if ( opt.persistence ) {
        return new CollectionPersistence( name);
    } else {
        return new CollectionLoki( name );
    }
  }

  // close
  // close stops all collection activities and disables all public methods.
  public close() {
  }

  // watch
  // watch watches for modified documents in the collection and emits
  // when they change. Accepts an optional selector to only watch changes
  // made to documents which match the selector.
  public watch(selector?: Selector): Observable<DocumentChange<T>> {
    return EMPTY;
  }

  // find
  // find returns an observable of documents which matches the given
  // selector and filter options (both are optional). The observable
  // re-emits whenever the result value changes.
  public find(selector: Selector = {}, options: FindOptions = {}): Observable<T[]> {
    return EMPTY;
  }

  // find
  // find returns an observable of a document which matches the given
  // selector and filter options (both are optional). The observable
  // re-emits whenever the result value changes.
  public findOne(selector: Selector = {}, options: FindOptions = {}): Observable<T> {
    return EMPTY;
  }

  public async initDocumentSync?( docId: string, automergeId: string ) {
  }

  // insert
  // insert inserts a new document into the collection. If a document
  // with the id already exists in the collection, it will be replaced.
  public async insert(docOrDocs: T | T[], noSync = false ): Promise<void> {
  }

  // update
  // update modifies existing documents in the collection which passes
  // the given selector.
  public async update(selector: Selector, _modifier: Modifier): Promise<void> {
  }

  // remove
  // remove removes existing documents in the collection which passes
  // the given selector.
  public async remove(selector: Selector): Promise<void> {
  }

  public async reload() {
  }

}
