// Runtime store for wins (Summer store). Fail-open without credentials:
// the durable source remains the merged PR body. Ingest is create-only;
// receipts use overwrite so measure-due never mirrors into git.
const PREFIX = 'summer-company/wins-ledger/';
const METRICS_PATH = `${PREFIX}_metrics/latest.json`;
const MEASURE_PATH = `${PREFIX}_measure/latest.json`;

function objectUrl(env, path, mode) {
  const url = new URL('/v1/object', env.SUMMER_STORE_URL);
  url.searchParams.set('path', path);
  if (mode) url.searchParams.set('mode', mode);
  return url;
}

function authHeaders(env) {
  return { authorization: `Bearer ${env.SUMMER_STORE_TOKEN}` };
}

function configured(env) {
  return Boolean(env.SUMMER_STORE_URL && env.SUMMER_STORE_TOKEN);
}

export async function putWinToStore(win, env = process.env, fetchImpl = fetch) {
  if (!configured(env))
    return 'store not configured; win stays in the merged PR body';
  const res = await fetchImpl(
    objectUrl(env, `${PREFIX}${win.id}.json`, 'create'),
    {
      method: 'PUT',
      body: JSON.stringify(win),
      headers: authHeaders(env),
    }
  );
  if (res.status === 409) return 'already recorded';
  if (!res.ok) throw new Error(`wins store write failed: ${res.status}`);
  return 'recorded in store';
}

/** Overwrite a win record (receipts / measure updates). Data stays out of git. */
export async function overwriteWinInStore(
  win,
  env = process.env,
  fetchImpl = fetch
) {
  if (!configured(env)) return 'store not configured; receipt not persisted';
  const res = await fetchImpl(
    objectUrl(env, `${PREFIX}${win.id}.json`, 'overwrite'),
    {
      method: 'PUT',
      body: JSON.stringify(win),
      headers: authHeaders(env),
    }
  );
  if (!res.ok) throw new Error(`wins store overwrite failed: ${res.status}`);
  return 'receipt recorded in store';
}

export async function getWinFromStore(
  id,
  env = process.env,
  fetchImpl = fetch
) {
  if (!configured(env)) return null;
  const res = await fetchImpl(objectUrl(env, `${PREFIX}${id}.json`), {
    headers: authHeaders(env),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`wins store read failed: ${res.status}`);
  return /** @type {object} */ (await res.json());
}

/**
 * List win records from the store (bodies inline). Skips `_` report objects.
 * @returns {Promise<object[]>}
 */
export async function listWinsFromStore(env = process.env, fetchImpl = fetch) {
  if (!configured(env)) return [];
  const wins = [];
  let cursor = null;
  for (;;) {
    const url = new URL('/v1/list', env.SUMMER_STORE_URL);
    url.searchParams.set('prefix', PREFIX);
    url.searchParams.set('bodies', '1');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetchImpl(url, { headers: authHeaders(env) });
    if (!res.ok) throw new Error(`wins store list failed: ${res.status}`);
    const page =
      /** @type {{ blobs?: { pathname: string, body?: string }[], hasMore?: boolean, cursor?: string }} */ (
        await res.json()
      );
    for (const blob of page.blobs ?? []) {
      const name = blob.pathname.slice(PREFIX.length);
      if (!name || name.startsWith('_') || !name.endsWith('.json')) continue;
      if (!blob.body) continue;
      wins.push(JSON.parse(blob.body));
    }
    if (!page.hasMore) break;
    cursor = page.cursor ?? null;
    if (!cursor) break;
  }
  return wins;
}

/**
 * Union receipts from ledger + store. Store entries win on metric/at/value
 * collisions. An empty store `[]` (ingest create) must not erase ledger-only
 * receipts from a local `receipt` without `--store`.
 * @param {unknown} ledgerReceipts
 * @param {unknown} storeReceipts
 */
export function mergeReceipts(ledgerReceipts, storeReceipts) {
  const ledger = Array.isArray(ledgerReceipts) ? ledgerReceipts : [];
  const store = Array.isArray(storeReceipts) ? storeReceipts : [];
  if (store.length === 0) return ledger;
  if (ledger.length === 0) return store;
  const key = r => `${r?.metric ?? ''}\0${r?.at ?? ''}\0${r?.value ?? ''}`;
  const byKey = new Map(ledger.map(r => [key(r), r]));
  for (const r of store) byKey.set(key(r), r);
  return [...byKey.values()];
}

/**
 * Merge ledger wins with store overlays (store fields win by id; receipts union).
 * @param {object[]} ledgerWins
 * @param {object[]} storeWins
 */
export function mergeWins(ledgerWins, storeWins) {
  const byId = new Map(ledgerWins.map(w => [w.id, w]));
  for (const w of storeWins) {
    const prior = byId.get(w.id);
    byId.set(
      w.id,
      prior
        ? {
            ...prior,
            ...w,
            receipts: mergeReceipts(prior.receipts, w.receipts),
          }
        : w
    );
  }
  return [...byId.values()];
}

export async function putWinsMetricsToStore(
  metrics,
  env = process.env,
  fetchImpl = fetch
) {
  if (!configured(env)) return 'store not configured; metrics not persisted';
  const res = await fetchImpl(objectUrl(env, METRICS_PATH, 'overwrite'), {
    method: 'PUT',
    body: JSON.stringify(metrics),
    headers: authHeaders(env),
  });
  if (!res.ok)
    throw new Error(`wins metrics store write failed: ${res.status}`);
  return 'metrics recorded in store';
}

export async function putMeasureReportToStore(
  report,
  env = process.env,
  fetchImpl = fetch
) {
  if (!configured(env))
    return 'store not configured; measure report not persisted';
  const res = await fetchImpl(objectUrl(env, MEASURE_PATH, 'overwrite'), {
    method: 'PUT',
    body: JSON.stringify(report),
    headers: authHeaders(env),
  });
  if (!res.ok)
    throw new Error(`wins measure report store write failed: ${res.status}`);
  return 'measure report recorded in store';
}

export const WINS_STORE_PREFIX = PREFIX;
export const WINS_STORE_METRICS_PATH = METRICS_PATH;
export const WINS_STORE_MEASURE_PATH = MEASURE_PATH;
