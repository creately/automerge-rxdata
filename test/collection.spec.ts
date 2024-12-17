import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { Collection } from '../src/collection';
import { watchN, findN, find1N } from './utils';
import { Database } from '../src/database';
import { ErrCollectionClosed } from '../src';
// import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
// import { Repo } from '@automerge/automerge-repo';

describe('Collection', () => {
  let database: Database;

  beforeEach(() => {
    // const storage = new IndexedDBStorageAdapter(`automergeRxdata`);
    // Collection.repo = new Repo({ storage });
  });

  async function prepare() {
    database = new Database('test-db');
    const name = `col-${Math.random()}`;
    const col = new Collection<any>(name);
    return { name, col };
  }

  afterEach(() => {
    try {
      database.close();
    } catch (err) {
      // ...
    }
  });

  const TEST_DOCS = Object.freeze([
    Object.freeze({ id: 'd111', x: 1, y: 1, z: 1 }),
    Object.freeze({ id: 'd112', x: 1, y: 1, z: 2 }),
    Object.freeze({ id: 'd113', x: 1, y: 1, z: 3 }),
    Object.freeze({ id: 'd121', x: 1, y: 2, z: 1 }),
    Object.freeze({ id: 'd122', x: 1, y: 2, z: 2 }),
    Object.freeze({ id: 'd123', x: 1, y: 2, z: 3 }),
  ]);

//   describe('initialize', () => {
//     it('should create repo if repo is not passed', async () => {
//       delete Collection.repo;
//       const docHandle = await Collection.initilize();
//       expect(Collection.repo).toBeDefined();
//     });
//     it('should not create repo if repo is passed', async () => {
//       const docHandle = await Collection.initilize({});
//       expect(Collection.repo).toEqual({});
//     });
//   });

  describe('close', () => {
    it('should throw an error on active queries', async () => {
      const { col } = await prepare();
      const promise = findN(col, 2);
      promise
        .then(() => fail())
        .catch((err) => {
          expect(err).toBe(ErrCollectionClosed);
        });
      col.close();
    });

    it('should disable all public methods', async () => {
      const { col } = await prepare();
      col.close();
      [
        () => col.close(),
        () => col.watch(),
        () => col.find(),
        () => col.findOne(),
        () => col.insert([]),
        () => col.update({}, { $set: { foo: 'bar' } }),
        () => col.remove({}),
      ].forEach((fn) => {
        try {
          fn();
          fail();
        } catch (err) {
          expect(err).toBe(ErrCollectionClosed);
        }
      });
    });
  });

  describe('watch', () => {
    it('should return an observable', async () => {
      const { col } = await prepare();
      expect(col.watch()).toEqual(jasmine.any(Observable));
    });

    it('should not emit any documents immediately', async () => {
      const { col } = await prepare();
      const watchPromise = watchN(col, 1);
      const sleepPromise = new Promise((f) => setTimeout(() => f('awake'), 100));
      const out = await Promise.race([watchPromise, sleepPromise]);
      expect(out).toBe('awake');
    });

    it('should not emit any documents immediately (with selector)', async () => {
      const { col } = await prepare();
      const watchPromise = watchN(col, 1, { z: 3 });
      const sleepPromise = new Promise((f) => setTimeout(() => f('awake'), 100));
      const out = await Promise.race([watchPromise, sleepPromise]);
      expect(out).toBe('awake');
    });

    describe('on change', () => {
      it('should emit modified documents if a selector is not given', async () => {
        const { col } = await prepare();
        const promise = watchN(col, 1);
        await col.insert(TEST_DOCS);
        const out = await promise;
        expect(out).toEqual([{ id: jasmine.any(Number) as any as number, type: 'insert', docs: [...TEST_DOCS] }]);
      });

      it('should emit modified documents if they match the selector', async () => {
        const { col } = await prepare();
        const watchPromise = watchN(col, 1, { z: 3 });
        await col.insert(TEST_DOCS);
        const out = await watchPromise;
        expect(out).toEqual([
          { id: jasmine.any(Number) as any as number, type: 'insert', docs: TEST_DOCS.filter((doc) => doc.z === 3) },
        ]);
      });

      it('should not emit modified documents if they do not match the selector', async () => {
        const { col } = await prepare();
        const watchPromise = watchN(col, 1, { z: 5 });
        const sleepPromise = new Promise((f) => setTimeout(() => f('awake'), 100));
        await col.insert(TEST_DOCS);
        const out = await Promise.race([watchPromise, sleepPromise]);
        expect(out).toBe('awake');
      });
    });
  });

  describe('find', () => {
    it('should return an observable', async () => {
      const { col } = await prepare();
      expect(col.find()).toEqual(jasmine.any(Observable));
    });

    it('should emit all documents if a selector is not given', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await findN(col, 1);
      expect(out).toEqual([[...TEST_DOCS]]);
    });

    it('should emit an empty array if no documents match selector', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await findN(col, 1, { x: -1 });
      expect(out).toEqual([[]]);
    });

    it('should emit an empty array if no documents match selector (with id)', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await findN(col, 1, { id: 'd000' });
      expect(out).toEqual([[]]);
    });

    it('should emit all matching document immediately', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await findN(col, 1, { z: 3 });
      expect(out).toEqual([TEST_DOCS.filter((doc) => doc.z === 3)]);
    });

    it('should emit all matching document immediately (with id)', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await findN(col, 1, { id: 'd111' });
      expect(out).toEqual([TEST_DOCS.filter((doc) => doc.id === 'd111')]);
    });

    it('should be possible to use a filter set for the id field', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await findN(col, 1, { id: { $in: ['d111', 'd112'] } });
      expect(out).toEqual([TEST_DOCS.filter((doc) => doc.id === 'd111' || doc.id === 'd112')]);
    });

    it('should sort matching documents if sort option is set', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await findN(col, 1, { y: 2 }, { sort: { z: -1 } });
      expect(out).toEqual([TEST_DOCS.filter((doc) => doc.y === 2).reverse()]);
    });

    it('should skip given number of matching documents if skip option is set', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await findN(col, 1, { y: 2 }, { sort: { z: -1 }, skip: 1 });
      expect(out).toEqual([
        TEST_DOCS.filter((doc) => doc.y === 2)
          .reverse()
          .slice(1),
      ]);
    });

    it('should limit result to given number of matching documents if limit option is set', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await findN(col, 1, { y: 2 }, { limit: 2 });
      expect(out).toEqual([TEST_DOCS.filter((doc) => doc.y === 2).slice(0, 2)]);
    });

    it('should not re-emit the same result if documents in the result did not change', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const promise = findN(col, 2, { z: 3 });
      await col.update({ z: 2 }, { $set: { a: 1 } });
      await col.update({ z: 3 }, { $set: { a: 2 } });
      const out = await promise;
      expect(out).toEqual([
        [
          { id: 'd113', x: 1, y: 1, z: 3 },
          { id: 'd123', x: 1, y: 2, z: 3 },
        ],
        [
          { id: 'd113', x: 1, y: 1, z: 3, a: 2 },
          { id: 'd123', x: 1, y: 2, z: 3, a: 2 },
        ],
      ]);
    });

    it('should not call the load method until user subscribes to the observable', async () => {
      const { col } = await prepare();
      spyOn(col as any, 'load').and.returnValue(Promise.resolve([]));
      const observable = col.find({});
      expect((col as any).load).not.toHaveBeenCalled();
      await observable.pipe(take(1)).toPromise();
      expect((col as any).load).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return an observable', async () => {
      const { col } = await prepare();
      expect(col.findOne()).toEqual(jasmine.any(Observable));
    });

    it('should emit a document if a selector is not given', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = (await find1N(col, 1)) || [];
      expect(TEST_DOCS.findIndex((doc) => doc.id === out[0].id)).not.toBe(-1);
    });

    it('should emit null if no documents match the selector', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await find1N(col, 1, { x: -1 });
      expect(out).toEqual([null]);
    });

    it('should a matching document immediately', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = (await find1N(col, 1, { z: 3 })) || [];
      const matches = TEST_DOCS.filter((doc) => doc.z === 3);
      expect(matches.findIndex((doc) => doc.id === out[0].id)).not.toBe(-1);
    });

    it('should sort and get the matching document if sort option is set', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await find1N(col, 1, { y: 2 }, { sort: { z: -1 } });
      expect(out).toEqual([TEST_DOCS.filter((doc) => doc.y === 2).reverse()[0]]);
    });

    it('should skip given number of matching documents if skip option is set', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await find1N(col, 1, { y: 2 }, { sort: { z: -1 }, skip: 1 });
      expect(out).toEqual([TEST_DOCS.filter((doc) => doc.y === 2).reverse()[1]]);
    });

    it('should not re-emit the same result if documents in the result did not change', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const promise = find1N(col, 2, { z: 3 });
      await col.update({ z: 2 }, { $set: { a: 1 } });
      await col.update({ z: 3 }, { $set: { a: 2 } });
      const out = await promise;
      expect(out).toEqual([
        { id: 'd113', x: 1, y: 1, z: 3 },
        { id: 'd113', x: 1, y: 1, z: 3, a: 2 },
      ]);
    });

    it('should not call the load method until user subscribes to the observable', async () => {
      const { col } = await prepare();
      spyOn(col as any, 'load').and.returnValue(Promise.resolve([]));
      const observable = col.findOne({});
      expect((col as any).load).not.toHaveBeenCalled();
      await observable.pipe(take(1)).toPromise();
      expect((col as any).load).toHaveBeenCalled();
    });
  });

  describe('insert', () => {
    it('should return a promise which resolves to undefined', async () => {
      const { col } = await prepare();
      const out = await col.insert({ id: 'd1' });
      expect(out).toBe(undefined);
    });

    it('should return inserted documents with new queries', async () => {
      const { col } = await prepare();
      await Promise.all(TEST_DOCS.map((doc) => col.insert(doc)));
      const out = await findN(col, 1, {});
      console.log('out', out)
      console.log('old out', [[...TEST_DOCS]]);
      expect(out).toEqual([[...TEST_DOCS]]);
    });

    it('should return inserted documents with new queries and replace already exsiting', async () => {
      const { col } = await prepare();
      await Promise.all(TEST_DOCS.map((doc) => col.insert(doc)));
      const out = await findN(col, 1, {});
      expect(out).toEqual([[...TEST_DOCS]]);
            
      // replacing 
      await col.insert({ id: 'd111', x: 100, y: 100 });
      const out1 = [...TEST_DOCS];
      out1[0] = { id: 'd111', x: 100, y: 100 } as any;
      expect(( await findN(col, 1, {}))).toEqual([ out1 ]);
    });

    it('should return inserted documents with new queries (insert array)', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const out = await findN(col, 1, {});
      expect(out).toEqual([[...TEST_DOCS]]);
    });

    it('should emit the inserted document as a change (local)', async () => {
      const { col } = await prepare();
      const promise = watchN(col, 1);
      await col.insert(TEST_DOCS);
      const out = await promise;
      expect(out).toEqual([{ id: jasmine.any(Number) as any as number, type: 'insert', docs: [...TEST_DOCS] }]);
    });

    it('should emit the inserted document as a change (remote)');
  });

  describe('update', () => {
    it('should return a promise which resolves to undefined', async () => {
      const { col } = await prepare();
      const out = await col.update({}, { $set: { a: 1 } });
      expect(out).toBe(undefined);
    });

    it('should return updated document with new queries', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      await col.update({ z: 3 }, { $set: { a: 1 } });
      const out = await findN(col, 1, {});
      expect(out).toEqual([
        [
          { id: 'd111', x: 1, y: 1, z: 1 },
          { id: 'd112', x: 1, y: 1, z: 2 },
          { id: 'd113', x: 1, y: 1, z: 3, a: 1 },
          { id: 'd121', x: 1, y: 2, z: 1 },
          { id: 'd122', x: 1, y: 2, z: 2 },
          { id: 'd123', x: 1, y: 2, z: 3, a: 1 },
        ],
      ]);
    });

    it('should return updated document with new queries (nested)', async () => {
      try {
        const { col } = await prepare();
        await col.insert(TEST_DOCS);
        await col.update({ z: 3 }, { $set: { 'a.b': 1 } });
        const out = await findN(col, 1, {});
        expect(out).toEqual([
          [
            { id: 'd111', x: 1, y: 1, z: 1 },
            { id: 'd112', x: 1, y: 1, z: 2 },
            { id: 'd113', x: 1, y: 1, z: 3, a: { b: 1 } },
            { id: 'd121', x: 1, y: 2, z: 1 },
            { id: 'd122', x: 1, y: 2, z: 2 },
            { id: 'd123', x: 1, y: 2, z: 3, a: { b: 1 } },
          ],
        ]);
      } catch (err) {
        console.error(err);
      }
    });

    it('should emit the updated document as a change (local)', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const promise = watchN(col, 2);
      await col.update({ z: 3 }, { $set: { a: 1 } });
      const out = await promise;
      console.log('out', out);
      // Following test changed comparing to original rxdata implementation
      expect(out).toEqual([
        {
          id: jasmine.any(Number) as any as number,
          type: 'update',
          docs: [
            { id: 'd113', x: 1, y: 1, z: 3, a: 1 },
            // { id: 'd123', x: 1, y: 2, z: 3, a: 1 },
          ],
          modifier: { $set: { a: 1 } },
        },
        {
          id: jasmine.any(Number) as any as number,
          type: 'update',
          docs: [
            // { id: 'd113', x: 1, y: 1, z: 3, a: 1 },
            { id: 'd123', x: 1, y: 2, z: 3, a: 1 },
          ],
          modifier: { $set: { a: 1 } },
        },
      ]);
    });

    it('should emit the updated document as a change (remote)');
  });

  describe('remove', () => {
    it('should return a promise which resolves to undefined', async () => {
      const { col } = await prepare();
      const out = await col.remove({});
      expect(out).toBe(undefined);
    });

    it('should not return removed documents with new queries', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      await col.remove({ z: 3 });
      const out = await findN(col, 1, {});
      expect(out).toEqual([
        [
          { id: 'd111', x: 1, y: 1, z: 1 },
          { id: 'd112', x: 1, y: 1, z: 2 },
          { id: 'd121', x: 1, y: 2, z: 1 },
          { id: 'd122', x: 1, y: 2, z: 2 },
        ],
      ]);
    });

    it('should emit the removed document as a change (local)', async () => {
      const { col } = await prepare();
      await col.insert(TEST_DOCS);
      const promise = watchN(col, 1);
      await col.remove({ z: 3 });
      const out = await promise;
      expect(out).toEqual([
        {
          id: jasmine.any(Number) as any as number,
          type: 'remove',
          docs: [
            { id: 'd113', x: 1, y: 1, z: 3 },
            { id: 'd123', x: 1, y: 2, z: 3 },
          ],
        },
      ]);
    });

    it('should emit the removed document as a change (remote)');
  });

//   describe('reload', () => {
//     it('should load documents and emit alldocs', async () => {
//       const NEW_DOC = Object.freeze([Object.freeze({ id: 'e123', x: 1, y: 1, z: 1 })]);
//       const { col } = await prepare();
//       spyOn(col as any, 'loadAll').and.returnValue(Promise.resolve([NEW_DOC]));
//       (col as any).allDocs.subscribe((val: any) => {
//         expect(val).toEqual([NEW_DOC]);
//       });
//       await col.reload();
//     });
//   });
});
