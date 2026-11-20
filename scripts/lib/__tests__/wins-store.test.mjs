import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mergeWins,
  overwriteWinInStore,
  putMeasureReportToStore,
  putWinsMetricsToStore,
  putWinToStore,
  WINS_STORE_MEASURE_PATH,
  WINS_STORE_METRICS_PATH,
} from '../wins-store.mjs';

const env = { SUMMER_STORE_URL: 'https://s.example', SUMMER_STORE_TOKEN: 't' };

test('wins store: create-only write, exists is ok, unconfigured fails open', async () => {
  /** @type {{ u: string, o: unknown }} */
  let seen = { u: '', o: undefined };
  /** @type {typeof fetch} */
  const ok = /** @type {any} */ (
    async (/** @type {any} */ u, /** @type {any} */ o) => (
      (seen = { u: String(u), o }), { ok: true, status: 200 }
    )
  );
  assert.equal(
    await putWinToStore({ id: 'win-1' }, env, ok),
    'recorded in store'
  );
  assert.match(seen.u, /mode=create/);
  assert.match(seen.u, /wins-ledger%2Fwin-1\.json|wins-ledger\/win-1\.json/);
  assert.equal(
    await putWinToStore(
      { id: 'w' },
      env,
      /** @type {any} */ (
        async () => ({
          ok: false,
          status: 409,
        })
      )
    ),
    'already recorded'
  );
  assert.match(
    await putWinToStore(
      { id: 'w' },
      {},
      /** @type {any} */ (async () => assert.fail())
    ),
    /not configured/
  );
  await assert.rejects(
    putWinToStore(
      { id: 'w' },
      env,
      /** @type {any} */ (async () => ({ ok: false, status: 500 }))
    )
  );
});

test('wins store: receipt overwrite and metrics/measure reports use overwrite', async () => {
  /** @type {string[]} */
  const urls = [];
  const fetchImpl = /** @type {any} */ (
    async u => {
      urls.push(String(u));
      return { ok: true, status: 200 };
    }
  );
  assert.equal(
    await overwriteWinInStore({ id: 'win-2', receipts: [] }, env, fetchImpl),
    'receipt recorded in store'
  );
  assert.match(urls[0], /mode=overwrite/);
  assert.match(urls[0], /win-2\.json/);

  assert.equal(
    await putWinsMetricsToStore({ winsVerified: 2 }, env, fetchImpl),
    'metrics recorded in store'
  );
  assert.ok(
    urls[1].includes(encodeURIComponent(WINS_STORE_METRICS_PATH)) ||
      urls[1].includes(WINS_STORE_METRICS_PATH)
  );
  assert.match(urls[1], /mode=overwrite/);

  assert.equal(
    await putMeasureReportToStore({ measured: [] }, env, fetchImpl),
    'measure report recorded in store'
  );
  assert.ok(
    urls[2].includes(encodeURIComponent(WINS_STORE_MEASURE_PATH)) ||
      urls[2].includes(WINS_STORE_MEASURE_PATH)
  );
});

test('mergeWins: store receipts overlay ledger rows by id', () => {
  const ledger = [
    { id: 'a', receipts: [], claim: 'ledger' },
    { id: 'b', receipts: [], claim: 'only-ledger' },
  ];
  const store = [
    {
      id: 'a',
      receipts: [{ metric: 'x', value: 1, at: 't', evidence: 'e' }],
      claim: 'store',
    },
    { id: 'c', receipts: [], claim: 'only-store' },
  ];
  const merged = mergeWins(ledger, store);
  assert.equal(merged.find(w => w.id === 'a').claim, 'store');
  assert.equal(merged.find(w => w.id === 'a').receipts.length, 1);
  assert.ok(merged.find(w => w.id === 'b'));
  assert.ok(merged.find(w => w.id === 'c'));
});
