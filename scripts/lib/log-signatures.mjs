/**
 * Vercel runtime log closed loop (no log drains, no paid ingestion). `vercel logs --json -q level:error`
 * is polled on a schedule; records are sampled, normalized to a signature, clustered, and compared
 * with the previous run to find NEW and RISING signatures plus per-route error spikes.
 */
export const LOG_SIGNATURE_SCHEMA = 'jovie.log-signatures/v1';
export const MAX_RECORDS = 500;

/** Strip volatile tokens so the same defect always hashes to one signature. */
export function normalizeMessage(message) {
  return String(message ?? '')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      '<uuid>'
    )
    .replace(/\b(?:dpl|prj|team|req|usr|user)_[A-Za-z0-9]+\b/g, '<id>')
    .replace(/\b\d+\.\d+\b/g, '<n>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<ts>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}
export function routeOf(record) {
  const path = String(record.requestPath ?? '').split('?')[0];
  const out = path
    .split('/')
    .map(seg =>
      /^v\d+$/u.test(seg)
        ? seg
        : seg.length >= 16 ||
            /^[0-9a-f-]{8,}$/iu.test(seg) ||
            /^\d+$/u.test(seg)
          ? ':id'
          : seg
    )
    .join('/');
  return out || '(none)';
}
export function signatureOf(record) {
  return `${record.level ?? 'error'}|${routeOf(record)}|${normalizeMessage(record.message)}`;
}
/** JSONL from `vercel logs --json` -> records (summary lines dropped), bounded by a sample cap. */
export function parseLogLines(text, max = MAX_RECORDS) {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim() || out.length >= max) continue;
    try {
      const row = JSON.parse(line);
      if (row.type === 'log' && row.data) out.push(row.data);
    } catch {
      /* skip partial line */
    }
  }
  return out;
}
export function cluster(records) {
  const map = new Map();
  for (const r of records) {
    const sig = signatureOf(r);
    const c = map.get(sig) ?? {
      signature: sig,
      route: routeOf(r),
      project: r.projectId ?? '',
      count: 0,
      sample: String(r.message ?? '').slice(0, 300),
      firstSeen: r.timestamp,
      lastSeen: r.timestamp,
    };
    c.count += 1;
    if (r.timestamp < c.firstSeen) c.firstSeen = r.timestamp;
    if (r.timestamp > c.lastSeen) c.lastSeen = r.timestamp;
    map.set(sig, c);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}
/**
 * previous = { signature: count } from the last run (stored as a small artifact/state file).
 * NEW: not seen before. RISING: count at least `factor` times the previous count and above `floor`.
 */
export function diffSignatures(
  clusters,
  previous = {},
  { factor = 3, floor = 5 } = {}
) {
  const fresh = [],
    rising = [];
  for (const c of clusters) {
    const before = previous[c.signature];
    if (before === undefined) {
      if (c.count >= 2) fresh.push(c);
    } else if (c.count >= floor && c.count >= factor * Math.max(before, 1))
      rising.push({ ...c, previous: before });
  }
  return { fresh, rising };
}
export function errorsPerRoute(records) {
  const out = {};
  for (const r of records) out[routeOf(r)] = (out[routeOf(r)] ?? 0) + 1;
  return out;
}
/** Route spike: current window errors vs the prior window, using the same 3x rule. */
export function routeSpikes(
  current,
  previous,
  { factor = 3, floor = 10 } = {}
) {
  return Object.entries(current)
    .filter(
      ([route, n]) =>
        n >= floor && n > factor * Math.max(previous[route] ?? 0, 1)
    )
    .map(([route, n]) => ({ route, count: n, previous: previous[route] ?? 0 }));
}
export function remediationItems({ fresh, rising, project }) {
  return [
    ...fresh.map(c => ({
      fingerprint: `vercel-log:${project}:${c.signature}`.slice(0, 200),
      kind: 'new',
      ...c,
    })),
    ...rising.map(c => ({
      fingerprint: `vercel-log:${project}:${c.signature}`.slice(0, 200),
      kind: 'rising',
      ...c,
    })),
  ];
}
