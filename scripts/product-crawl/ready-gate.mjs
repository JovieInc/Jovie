// Product readiness gate (Tim, 2026-11-08: "first we need agent to crawl the
// whole product and declare it ready. if they find jank, we ship fix and
// repeat"). Pure: judges a crawl receipt; crawl.mjs produces it.
//
// "Ready" is not a judgment call. It needs a fresh crawl of the deployed
// build, as a stranger and signed in, that covered every page route the app
// ships with zero findings. A route seen only behind a sign-in wall is not
// covered; a route the crawl can't reach counts only as a reviewed exception
// (uncovered entry with accepted: true), never by the crawler's own say-so.

export const THRESHOLDS = Object.freeze({
  cls: 0.1, // web.dev "good" CLS
  lcpMs: 2500, // web.dev "good" LCP
  longTaskMs: 200, // a main-thread stall the visitor sees as a frozen frame
  loadMs: 5000,
});

export const PLACEHOLDER =
  /\b(lorem ipsum|TODO|FIXME|undefined|NaN|\[object Object\]|placeholder text)\b/;

export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const IDENTITIES = Object.freeze(['stranger', 'signed-in']);

/**
 * @param {{ route: string, identity: string, viewport: string, status?: number,
 *   error?: string, authGated?: boolean, cls?: number, lcpMs?: number,
 *   longestTaskMs?: number, loadMs?: number, consoleErrors?: string[],
 *   failedRequests?: string[], placeholder?: string|null,
 *   horizontalOverflow?: boolean }} page
 * @returns {{ route: string, identity: string, viewport: string, kind: string, detail: string }[]}
 */
export function pageFindings(page) {
  const at = {
    route: page.route,
    identity: page.identity,
    viewport: page.viewport,
  };
  const f = (kind, detail) => ({ ...at, kind, detail });
  if (page.error) return [f('unreachable', page.error)];
  if (page.authGated) return [];
  const out = [];
  if (page.status >= 500) out.push(f('server-error', `HTTP ${page.status}`));
  else if (page.status >= 400)
    out.push(f('broken-route', `HTTP ${page.status}`));
  if ((page.cls ?? 0) > THRESHOLDS.cls)
    out.push(
      f('layout-shift', `CLS ${page.cls.toFixed(3)} > ${THRESHOLDS.cls}`)
    );
  if ((page.lcpMs ?? 0) > THRESHOLDS.lcpMs)
    out.push(
      f('slow-paint', `LCP ${Math.round(page.lcpMs)}ms > ${THRESHOLDS.lcpMs}ms`)
    );
  if ((page.longestTaskMs ?? 0) > THRESHOLDS.longTaskMs)
    out.push(
      f(
        'frozen-frame',
        `main thread blocked ${Math.round(page.longestTaskMs)}ms`
      )
    );
  if ((page.loadMs ?? 0) > THRESHOLDS.loadMs)
    out.push(
      f(
        'slow-load',
        `load ${Math.round(page.loadMs)}ms > ${THRESHOLDS.loadMs}ms`
      )
    );
  for (const e of page.consoleErrors ?? []) out.push(f('console-error', e));
  for (const r of page.failedRequests ?? []) out.push(f('failed-request', r));
  if (page.placeholder)
    out.push(f('placeholder', `page shows "${page.placeholder}"`));
  if (page.horizontalOverflow) out.push(f('overflow', 'page scrolls sideways'));
  return out;
}

/**
 * @param {{ origin: string, sha?: string, at: string, routes: string[],
 *   uncovered?: { route: string, reason: string }[],
 *   pages: Parameters<typeof pageFindings>[0][] }} receipt
 * @param {{ now?: number, deployedSha?: string }} [opts]
 */
export function productReady(receipt, opts = {}) {
  const now = opts.now ?? Date.now();
  const reasons = [];
  const findings = (receipt?.pages ?? []).flatMap(pageFindings);
  if (!receipt?.pages?.length) reasons.push('no crawl');
  else {
    const age = now - Date.parse(receipt.at);
    if (!(age <= MAX_AGE_MS)) reasons.push('crawl is older than a day');
    if (opts.deployedSha && receipt.sha !== opts.deployedSha)
      reasons.push('crawl is not of the deployed build');
    for (const id of IDENTITIES)
      if (!receipt.pages.some(p => p.identity === id && !p.error))
        reasons.push(
          `not crawled ${id === 'stranger' ? 'as a stranger' : 'signed in'}`
        );
    const seen = new Set([
      ...receipt.pages.filter(p => !p.error && !p.authGated).map(p => p.route),
      ...(receipt.uncovered ?? [])
        .filter(u => u.accepted === true && u.reason)
        .map(u => u.route),
    ]);
    const missing = (receipt.routes ?? []).filter(r => !seen.has(r));
    if (missing.length)
      reasons.push(`${missing.length} page routes not crawled`);
  }
  if (findings.length) reasons.push(`${findings.length} findings`);
  return { ready: reasons.length === 0, reasons, findings };
}

/** Most visitor-visible first: broken before slow before cosmetic. */
const ORDER = [
  'unreachable',
  'server-error',
  'broken-route',
  'frozen-frame',
  'layout-shift',
  'slow-paint',
  'slow-load',
  'console-error',
  'failed-request',
  'placeholder',
  'overflow',
];
export function rankFindings(findings) {
  return [...findings].sort(
    (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)
  );
}
