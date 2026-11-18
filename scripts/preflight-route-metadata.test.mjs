import assert from 'node:assert/strict';
import test from 'node:test';
import { companionChecklist } from './lib/preflight-changed.mjs';

const file = (filename, status = 'modified') => ({ filename, status });

test('route metadata edits call out an untouched colocated metadata test', () => {
  const layout = 'apps/web/app/waitlist/layout.tsx';
  const companion = 'apps/web/app/waitlist/layout.test.tsx';
  const read = path =>
    path === layout
      ? "export const metadata = { title: 'Reserve your spot' };"
      : path === companion
        ? 'expect(metadata.title).toBe(oldTitle);'
        : '';
  const items = companionChecklist([file(layout)], read);
  assert.equal(items.length, 1);
  assert.equal(items[0].done, false);
  assert.match(items[0].hint, /layout\.test\.tsx/);
  assert.match(items[0].hint, /vitest/);
  assert.equal(
    companionChecklist([file(layout), file(companion)], read)[0].done,
    true
  );
  assert.deepEqual(companionChecklist([file(layout, 'removed')], read), []);
  assert.deepEqual(
    companionChecklist([file(layout)], () => ''),
    []
  );
  assert.deepEqual(
    companionChecklist([file(layout)], path =>
      path === layout ? read(path) : ''
    ),
    []
  );
});
