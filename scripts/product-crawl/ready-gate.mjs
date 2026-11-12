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

// Sentence-start capitals count; TODO and NaN stay exact so "Todo list" or
// "Nan" (a name) aren't flagged. [object Object] has no word edges.
export const PLACEHOLDER =
  /\b(?:[Ll]orem ipsum|TODO|FIXME|undefined|NaN|[Pp]laceholder text)\b|\[object Object\]/;

// Timing on a shared CI runner is noisy: across three crawls on Nov 8 only
// one of 13 frozen frames came back on the same page. A page that trips a
// timing threshold is loaded twice more and judged on the median of three.
// Layout shift, errors and broken routes are judged on the first load.
export const TIMING_SAMPLES = 3;

/** @param {{ error?: string, lcpMs?: number, longestTaskMs?: number }} page */
export function timingSuspect(page) {
  return (
    !page.error &&
    ((page.lcpMs ?? 0) > THRESHOLDS.lcpMs ||
      (page.longestTaskMs ?? 0) > THRESHOLDS.longTaskMs)
  );
}

/**
 * The element inserted last in the half second before a shift at `atMs`
 * (the tallest, among inserts in the same batch), which is usually what
 * pushed the moved element. An earlier, larger insert already settled
 * before the shift, so it is not the cause.
 * @param {{ node: string, atMs: number, h: number }[] | undefined} added
 * @param {number | undefined} atMs
 */
export function causeOf(added, atMs) {
  if (!Number.isFinite(atMs)) return undefined;
  let best;
  for (const a of added ?? []) {
    if (a.atMs > atMs || a.atMs < atMs - 500) continue;
    if (!best || a.atMs > best.atMs || (a.atMs === best.atMs && a.h > best.h))
      best = a;
  }
  return best;
}

/**
 * How far a layout-shift source moved down (negative: up), in whole pixels,
 * or undefined when its top edge stayed put (a sideways move or a resize in
 * place), so the crawler keeps looking for the move that pushed it. Runs in
 * the page too, so it uses nothing outside its arguments.
 * @param {{ y: number } | undefined} a
 * @param {{ y: number } | undefined} b
 */
export function verticalMove(a, b) {
  if (!a || !b) return undefined;
  const dy = Math.round(b.y - a.y);
  return dy === 0 ? undefined : dy;
}

/** Median of the samples; the lower middle for an even count. */
export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
}

export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Frames whose own console output is not the product's: Cloudflare's
// challenge iframe logs CSP probes and devtools noise to itself.
export const THIRD_PARTY_FRAME_HOSTS = Object.freeze([
  'challenges.cloudflare.com',
]);

/** @param {string | undefined} url */
export function fromThirdPartyFrame(url) {
  if (!url) return false;
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return THIRD_PARTY_FRAME_HOSTS.some(
    h => host === h || host.endsWith(`.${h}`)
  );
}

/**
 * True when a reviewed list says the route is meant to 404 in production.
 * @param {string} route
 * @param {{ prefix: string, reason: string, exact?: boolean }[]} closed
 */
export function isClosedInProduction(route, closed) {
  return closed.some(
    c =>
      c.reason &&
      (route === c.prefix || (!c.exact && route.startsWith(`${c.prefix}/`)))
  );
}

// What the claim banner says on an unclaimed profile.
export const CLAIM_BANNER = /profile is unclaimed|claim (this|your) profile/i;

export const IDENTITIES = Object.freeze(['stranger', 'signed-in']);

const movedHow = s =>
  Number.isFinite(s.dy) && Number.isFinite(s.atMs)
    ? `, ${Math.abs(s.dy)}px ${s.dy < 0 ? 'up' : 'down'} at ${s.atMs}ms${
        s.after
          ? ` after ${s.after.node} (${s.after.h}px) appeared at ${s.after.atMs}ms`
          : ''
      }`
    : '';

const shiftedBy = page =>
  page.clsSources?.length
    ? `; moved: ${page.clsSources.map(s => `${s.node} (${s.value.toFixed(3)}${movedHow(s)})`).join(', ')}`
    : '';

/** What ran in the page's longest animation frame, slowest script first. */
const blockedBy = page => {
  const fr = page.frame;
  if (!fr?.scripts?.length) return '';
  const scripts = fr.scripts
    .map(
      x =>
        `${x.fn ? `${x.fn} in ` : ''}${x.src || 'inline'} via ${x.invoker} ${x.ms}ms`
    )
    .join(', ');
  return `; longest frame ${fr.ms}ms at ${fr.atMs}ms (layout ${fr.layoutMs}ms): ${scripts}`;
};

const ofSamples = page =>
  page.timingSamples > 1 ? ` (median of ${page.timingSamples} loads)` : '';

/**
 * @param {{ route: string, identity: string, viewport: string, status?: number,
 *   error?: string, authGated?: boolean, cls?: number, lcpMs?: number,
 *   longestTaskMs?: number, loadMs?: number, consoleErrors?: string[],
 *   failedRequests?: string[], placeholder?: string|null,
 *   horizontalOverflow?: boolean, url?: string, expectClaimBanner?: boolean,
 *   claimBanner?: boolean, timingSamples?: number,
 *   frame?: { ms: number, atMs: number, layoutMs: number,
 *     scripts: { src: string, fn: string, invoker: string, ms: number }[] },
 *   clsSources?: { node: string, value: number, dy?: number, atMs?: number,
 *     after?: { node: string, h: number, atMs: number } }[] }} page
 * @returns {{ route: string, identity: string, viewport: string, kind: string, detail: string }[]}
 */
export function pageFindings(page, closed = []) {
  const at = {
    route: page.route,
    identity: page.identity,
    viewport: page.viewport,
  };
  const f = (kind, detail) => ({ ...at, kind, detail });
  if (page.error) return [f('unreachable', page.error)];
  if (isClosedInProduction(page.route, closed))
    return page.status === 404
      ? []
      : [
          f(
            'closed-route-open',
            `HTTP ${page.status}; listed as closed in production`
          ),
        ];
  // Signed in, a sign-in wall means the session was lost: that is jank.
  if (page.authGated)
    return page.identity === 'signed-in'
      ? [f('session-lost', 'sent to sign in while signed in')]
      : [];
  const out = [];
  if (page.status >= 500) out.push(f('server-error', `HTTP ${page.status}`));
  else if (page.status >= 400)
    out.push(f('broken-route', `HTTP ${page.status}`));
  if (page.expectClaimBanner && page.claimBanner === false)
    out.push(
      f('claim-banner-missing', `no claim banner on ${page.url ?? page.route}`)
    );
  if ((page.cls ?? 0) > THRESHOLDS.cls)
    out.push(
      f(
        'layout-shift',
        `CLS ${page.cls.toFixed(3)} > ${THRESHOLDS.cls}${shiftedBy(page)}`
      )
    );
  if ((page.lcpMs ?? 0) > THRESHOLDS.lcpMs)
    out.push(
      f(
        'slow-paint',
        `LCP ${Math.round(page.lcpMs)}ms > ${THRESHOLDS.lcpMs}ms${ofSamples(page)}`
      )
    );
  if ((page.longestTaskMs ?? 0) > THRESHOLDS.longTaskMs)
    out.push(
      f(
        'frozen-frame',
        `main thread blocked ${Math.round(page.longestTaskMs)}ms${ofSamples(page)}${blockedBy(page)}`
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
 *   uncovered?: { route: string, reason: string, accepted?: boolean }[],
 *   closedInProduction?: { prefix: string, reason: string, exact?: boolean }[],
 *   outOfTime?: { loadsLeft: number, resamplesLeft: number } | null,
 *   pages: Parameters<typeof pageFindings>[0][] }} receipt
 * @param {{ now?: number, deployedSha?: string }} [opts]
 */
export function productReady(receipt, opts = {}) {
  const now = opts.now ?? Date.now();
  const reasons = [];
  const closed = receipt?.closedInProduction ?? [];
  const findings = (receipt?.pages ?? []).flatMap(p => pageFindings(p, closed));
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
    const late = receipt.outOfTime;
    if (late?.loadsLeft)
      reasons.push(
        `crawl hit its deadline with ${late.loadsLeft} page loads not made`
      );
    if (late?.resamplesLeft)
      reasons.push(
        `crawl hit its deadline with ${late.resamplesLeft} timing suspects judged on one load`
      );
  }
  if (findings.length) reasons.push(`${findings.length} findings`);
  return { ready: reasons.length === 0, reasons, findings };
}

/** Most visitor-visible first: broken before slow before cosmetic. */
const ORDER = [
  'unreachable',
  'server-error',
  'broken-route',
  'session-lost',
  'claim-banner-missing',
  'closed-route-open',
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
