/**
 * isitagentready.com regression ratchet for jov.ie. The scan result is
 * flattened to {check: status}; a check listed in the floor must stay at or
 * above that status. Raise the floor in agent-ready-floor.json when a check
 * is fixed and verified live; lower it only with a recorded decision.
 */

export const SCAN_ENDPOINT = 'https://isitagentready.com/api/scan';
const RANK = { fail: 0, neutral: 1, warn: 1, pass: 2 };

export function flattenScan(scan) {
  const statuses = {};
  for (const group of Object.values(scan?.checks ?? {}))
    for (const [name, result] of Object.entries(group))
      statuses[name] = result?.status ?? 'unknown';
  return statuses;
}

export function compareToFloor(statuses, floor) {
  const regressions = [];
  const improvements = [];
  for (const [name, required] of Object.entries(floor)) {
    const actual = statuses[name] ?? 'missing';
    const have = RANK[actual] ?? -1;
    if (have < RANK[required])
      regressions.push({ check: name, required, actual });
  }
  for (const [name, actual] of Object.entries(statuses))
    if (actual === 'pass' && !(name in floor)) improvements.push(name);
  return { regressions, improvements };
}

export async function runScan(url, fetchImpl = fetch) {
  const response = await fetchImpl(SCAN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error(`scan HTTP ${response.status}`);
  return response.json();
}
