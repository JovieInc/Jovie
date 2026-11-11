import assert from 'node:assert/strict';
import test from 'node:test';
import { d1Backend } from './index.ts';

function fakeDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return { all: async () => ({ results: [] }) };
        },
      };
    },
  };
}

test('list treats a cursor equal to the prefix as exclusive, so a page cannot repeat forever', async () => {
  const db = fakeDb();
  const backend = d1Backend(db);
  await backend.list('a/', 'a/', 1);
  assert.match(db.calls[0].sql, /pathname > \?1/);
  assert.equal(db.calls[0].args[0], 'a/');
  await backend.list('a/', null, 1);
  assert.match(db.calls[1].sql, /pathname >= \?1/);
  await backend.list('a/', 'a/b', 5);
  assert.match(db.calls[2].sql, /pathname > \?1/);
  assert.equal(db.calls[2].args[0], 'a/b');
});
