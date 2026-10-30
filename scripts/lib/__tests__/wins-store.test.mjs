import assert from 'node:assert/strict';
import { test } from 'node:test';
import { putWinToStore } from '../wins-store.mjs';

const env = { SUMMER_STORE_URL: 'https://s.example', SUMMER_STORE_TOKEN: 't' };
test('wins store: create-only write, exists is ok, unconfigured fails open', async () => {
  let seen;
  const ok = async (u, o) => (
    (seen = { u: String(u), o }), { ok: true, status: 200 }
  );
  assert.equal(
    await putWinToStore({ id: 'win-1' }, env, ok),
    'recorded in store'
  );
  assert.match(seen.u, /mode=create/);
  assert.match(seen.u, /wins-ledger%2Fwin-1\.json|wins-ledger\/win-1\.json/);
  assert.equal(
    await putWinToStore({ id: 'w' }, env, async () => ({
      ok: false,
      status: 409,
    })),
    'already recorded'
  );
  assert.match(
    await putWinToStore({ id: 'w' }, {}, async () => assert.fail()),
    /not configured/
  );
  await assert.rejects(
    putWinToStore({ id: 'w' }, env, async () => ({ ok: false, status: 500 }))
  );
});
