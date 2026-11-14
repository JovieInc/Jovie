// Split the product crawl across parallel jobs and put the pieces back
// together. Each shard discovers and samples exactly as a full crawl does,
// then loads only the routes that hash to it, so a route's viewports and
// identities stay in one shard. merge-receipts.mjs combines the shard
// receipts into the one receipt ready-gate.mjs judges.
import { overlayWalkSummary } from './overlay-walk.mjs';
import { rankFindings } from './ready-gate.mjs';

/** "2/4" -> { index: 2, count: 4 }. Empty means the whole crawl (1/1). */
export function parseShard(spec = '') {
  if (!spec) return { index: 1, count: 1 };
  const m = /^(\d+)\/(\d+)$/.exec(spec.trim());
  const index = Number(m?.[1]);
  const count = Number(m?.[2]);
  if (!m || count < 1 || index < 1 || index > count)
    throw new Error(`--shard must look like 2/4, got "${spec}"`);
  return { index, count };
}

/** Stable 1-based shard for a route (FNV-1a over the route string). */
export function shardOf(route, count) {
  let h = 0x811c9dc5;
  for (let i = 0; i < route.length; i += 1) {
    h ^= route.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % count) + 1;
}

export const inShard = (route, { index, count }) =>
  count === 1 || shardOf(route, count) === index;

const sum = (xs, f) => xs.reduce((n, x) => n + (f(x) || 0), 0);

/**
 * One receipt from every shard's receipt. Refuses a set that is not one
 * whole crawl of one build, since a partial set must never read as complete.
 * @param {any[]} receipts
 */
export function mergeReceipts(receipts) {
  if (!receipts.length) throw new Error('no shard receipts to merge');
  const count = receipts[0].shard?.count ?? 1;
  const got = receipts.map(r => r.shard?.index ?? 1).sort((a, b) => a - b);
  const want = Array.from({ length: count }, (_, i) => i + 1);
  if (
    receipts.some(r => (r.shard?.count ?? 1) !== count) ||
    got.join() !== want.join()
  )
    throw new Error(
      `shard receipts ${got.join(',')} are not one whole crawl of ${count}`
    );
  for (const key of ['origin', 'sha'])
    if (new Set(receipts.map(r => r[key] ?? null)).size > 1)
      throw new Error(`shard receipts disagree on ${key}`);
  const [first] = receipts;
  const uncovered = new Map();
  for (const u of receipts.flatMap(r => r.uncovered ?? []))
    uncovered.set(`${u.route}\n${u.reason}`, u);
  const loadsLeft = sum(receipts, r => r.outOfTime?.loadsLeft);
  const resamplesLeft = sum(receipts, r => r.outOfTime?.resamplesLeft);
  return {
    schema: first.schema,
    origin: first.origin,
    sha: first.sha ?? null,
    at: receipts.map(r => r.at).sort()[0],
    shards: count,
    signedIn: receipts.some(r => r.signedIn),
    routes: [...new Set(receipts.flatMap(r => r.routes ?? []))].sort(),
    samples: first.samples,
    sitemapProblem:
      receipts.find(r => r.sitemapProblem)?.sitemapProblem ?? null,
    uncovered: [...uncovered.values()],
    closedInProduction: first.closedInProduction,
    outOfTime: loadsLeft || resamplesLeft ? { loadsLeft, resamplesLeft } : null,
    overlayWalks: {
      walks: receipts.flatMap(r => r.overlayWalks?.walks ?? []),
      left: sum(receipts, r => r.overlayWalks?.left),
    },
    pages: receipts.flatMap(r => r.pages ?? []),
  };
}

/** The summary.md lines for a receipt and its verdict. */
export function summaryLines(receipt, verdict) {
  const { pages, uncovered, routes } = receipt;
  const byKind = {};
  for (const f of verdict.findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  return [
    `## Product crawl: ${verdict.ready ? 'ready' : 'not ready'}`,
    '',
    `${routes.length} page routes; ${pages.filter(p => p.identity === 'stranger').length} page loads as a stranger, ${pages.filter(p => p.identity === 'signed-in').length} signed in; ${uncovered.filter(u => !u.accepted).length} routes uncovered, ${uncovered.filter(u => u.accepted).length} reviewed exceptions; ${pages.filter(p => p.authGated).length} loads hit the sign-in wall.${receipt.shards > 1 ? ` Crawled in ${receipt.shards} parallel shards.` : ''}`,
    '',
    overlayWalkSummary(
      receipt.overlayWalks ?? { walks: [], left: 0 },
      receipt.signedIn
    ),
    '',
    `Not ready because: ${verdict.reasons.join('; ') || 'nothing'}`,
    '',
    `Findings by kind: ${
      Object.entries(byKind)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'none'
    }`,
    '',
    ...Object.keys(byKind).flatMap(kind => {
      const rows = rankFindings(verdict.findings).filter(f => f.kind === kind);
      return [
        '',
        `### ${kind} (${rows.length})`,
        '',
        '| route | viewport | detail |',
        '| --- | --- | --- |',
        ...rows
          .slice(0, 25)
          .map(
            f =>
              `| ${f.route} | ${f.viewport} | ${f.detail.replaceAll('|', '/').replaceAll('\n', ' ')} |`
          ),
      ];
    }),
  ];
}
