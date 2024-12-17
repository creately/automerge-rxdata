// Selector
// Selector is a mongo like selector used to filter documents.
export type Selector = any;

// Modifier
// Modifier is a mongo like modifier used to modify documents.
export type Modifier = any;

// IDocument
// IDocument is the base type for all documents stored in the database.
export interface IDocument {
  id: string;
}

// FindOptions
// FindOptions can be used to customized how documents are filtered.
// Fields are optional. They are used in this order: query, sort, skip, limit.
export type FindOptions = {
  sort?: { [key: string]: 1 | -1 };
  skip?: number;
  limit?: number;
};

// ErrCollectionClosed
// ErrCollectionClosed is thrown when an operation is attempted when the collection is closed.
export const ErrCollectionClosed = new Error('collection is closed');

// InsertDocumentChange
// InsertDocumentChange describes an insert operation performed on the collection.
// This includes an array of all inserted documents.
export type InsertDocumentChange<T> = {
  id: number;
  type: 'insert';
  docs: T[];
};

// RemoveDocumentChange
// RemoveDocumentChange describes an remove operation performed on the collection.
// This includes an array of all removed documents.
export type RemoveDocumentChange<T> = {
  id: number;
  type: 'remove';
  docs: T[];
};

// UpdateDocumentChange
// UpdateDocumentChange describes an update operation performed on the collection.
// This includes the update modifier and an array of all updated documents.
export type UpdateDocumentChange<T> = {
  id: number;
  type: 'update';
  docs: T[];
  modifier?: Modifier;
};

// DocumentChange
// DocumentChange describes a change which has occurred in the collection.
export type DocumentChange<T> = InsertDocumentChange<T> | RemoveDocumentChange<T> | UpdateDocumentChange<T>;