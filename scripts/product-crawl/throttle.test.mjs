import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeOnQuietReload, wasThrottled } from './throttle.mjs';

test('a 429 that clears on a quiet reload is not a finding', () => {
  const row = {
    failedRequests: ['429 /api/profile/capture-dismissal', '404 /x.png'],
  };
  assert.equal(wasThrottled(row), true);
  judgeOnQuietReload(row, { failedRequests: [] });
  assert.deepEqual(row.failedRequests, ['404 /x.png']);
  assert.deepEqual(row.throttledRequests, [
    '429 /api/profile/capture-dismissal',
  ]);
});

test('a 429 that survives the quiet reload stays a finding', () => {
  const row = { failedRequests: ['429 /api/profile/capture-dismissal'] };
  judgeOnQuietReload(row, {
    failedRequests: ['429 /api/profile/capture-dismissal', '500 /api/other'],
  });
  assert.deepEqual(row.failedRequests, ['429 /api/profile/capture-dismissal']);
});

test('a page with no 429 is not re-loaded', () => {
  assert.equal(wasThrottled({ failedRequests: ['500 /api/x'] }), false);
  assert.equal(wasThrottled({}), false);
});

test("the browser's console line for a 429 is judged on the quiet reload too", () => {
  const throttledLine =
    'Failed to load resource: the server responded with a status of 429 () (/api/shop)';
  const row = {
    failedRequests: ['429 /api/shop'],
    consoleErrors: [throttledLine, 'TypeError: x'],
  };
  judgeOnQuietReload(row, { failedRequests: [], consoleErrors: [] });
  assert.deepEqual(row.consoleErrors, ['TypeError: x']);
  judgeOnQuietReload(row, {
    failedRequests: ['429 /api/shop'],
    consoleErrors: [throttledLine],
  });
  assert.deepEqual(row.consoleErrors, ['TypeError: x', throttledLine]);
});
