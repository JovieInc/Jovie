import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkNumbers, migrationNumbers } from './check-migration-numbers.mjs';

test('red: number not above main latest', () => {
  assert.equal(
    checkNumbers({ baseLatest: 148, added: [148], otherOpen: {} }).length,
    1
  );
});
test('red: another open PR shares the number', () => {
  const v = checkNumbers({
    baseLatest: 148,
    added: [149],
    otherOpen: { 23309: [149] },
  });
  assert.match(v[0], /#23309/);
});
test('green: unique and above main', () => {
  assert.deepEqual(
    checkNumbers({ baseLatest: 148, added: [150], otherOpen: { 1: [149] } }),
    []
  );
});
test('parses only migration sql paths', () => {
  assert.deepEqual(
    migrationNumbers([
      'apps/web/drizzle/migrations/0150_x.sql',
      'apps/web/drizzle/migrations/meta/0150_snapshot.json',
      'a.sql',
    ]),
    [150]
  );
});
