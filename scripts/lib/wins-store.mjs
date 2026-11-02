// Runtime store for wins (Summer store, create-only). Fail-open: with no store
// credentials the record stays in the merged PR body, which is always durable.
const PREFIX = 'summer-company/wins-ledger/';

export async function putWinToStore(win, env = process.env, fetchImpl = fetch) {
  if (!env.SUMMER_STORE_URL || !env.SUMMER_STORE_TOKEN)
    return 'store not configured; win stays in the merged PR body';
  const url = new URL('/v1/object', env.SUMMER_STORE_URL);
  url.searchParams.set('path', `${PREFIX}${win.id}.json`);
  url.searchParams.set('mode', 'create');
  const res = await fetchImpl(url, {
    method: 'PUT',
    body: JSON.stringify(win),
    headers: { authorization: `Bearer ${env.SUMMER_STORE_TOKEN}` },
  });
  if (res.status === 409) return 'already recorded';
  if (!res.ok) throw new Error(`wins store write failed: ${res.status}`);
  return 'recorded in store';
}
