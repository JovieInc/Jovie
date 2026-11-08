import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './index.ts';

const KEY = 'abc123/workspace.tar.gz';
const bucket = {
  get: async key =>
    key === KEY
      ? { body: new Blob(['bytes']).stream(), size: 5, httpEtag: '"e"' }
      : null,
};
const call = (
  path,
  env = { PEN_FILES: bucket, OBJECT_KEY: KEY },
  method = 'GET'
) => worker.fetch(new Request(`https://x.test/${path}`, { method }), env);

test('serves exactly the configured key', async () => {
  const res = await call(KEY);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'bytes');
});
test('404 for any other path, method or missing secret', async () => {
  assert.equal((await call('')).status, 404);
  assert.equal((await call('abc123/other.tar.gz')).status, 404);
  assert.equal((await call(`${KEY}/`)).status, 404);
  assert.equal(
    (await call(KEY, { PEN_FILES: bucket, OBJECT_KEY: KEY }, 'POST')).status,
    404
  );
  assert.equal((await call(KEY, { PEN_FILES: bucket })).status, 404);
  assert.equal((await call('%E0%A4%A')).status, 404);
});
