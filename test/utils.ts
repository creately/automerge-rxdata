import { take, toArray } from 'rxjs/operators';
import { Collection } from '../src/collection';
import { DocumentChange, IDocument } from '../src';

export function findN<T extends IDocument>(c: Collection<T>, n: number, ...args: any[]): Promise<T[][] | undefined> {
  return c
    .find(...args)
    .pipe(take(n), toArray())
    .toPromise();
}

export function find1N<T extends IDocument>(c: Collection<T>, n: number, ...args: any[]): Promise<T[] | undefined> {
  return c
    .findOne(...args)
    .pipe(take(n), toArray())
    .toPromise();
}

export function watchN<T extends IDocument>(c: Collection<T>, n: number, ...args: any[]): Promise<DocumentChange<T>[]> {
  return c
    .watch(...args)
    .pipe(take(n), toArray())
    .toPromise() as any;
}
