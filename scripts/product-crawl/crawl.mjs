#!/usr/bin/env node
// Crawl every page route the app ships, as a stranger and (given a saved
// session) signed in, and write a receipt that ready-gate.mjs judges. Usage:
//   node scripts/product-crawl/crawl.mjs --origin https://jov.ie --out <dir>
//     [--storage-state <signed-in Playwright state>] [--unclaimed-handle testartist]
//     [--deadline-epoch-ms <ms>]  (or CRAWL_DEADLINE_EPOCH_MS)
// Past the deadline it starts no new page loads and still writes the
// receipt, which then names how many loads were left (never ready). A crawl
// that ran into the job timeout used to leave no receipt at all.
// Desktop (1440x900) and phone (390x844). Measures layout shift, LCP, the
// longest main-thread stall, load time, console errors, failed same-origin
// requests, placeholder text and sideways scroll. The public profile is also
// crawled on an unclaimed test profile, where the claim banner must show.
// The crawl only loads pages: it never clicks, submits or pays. Its last
// pass (overlay-walk.mjs) hovers, resizes, presses Escape and follows one
// link on a few pages, looking for overlays left up without their anchor.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { skipSignedIn, uncoveredEntry } from './accepted-uncovered.mjs';
import { MEASURE, OBSERVE } from './observe.mjs';
import { overlayWalkSummary, runOverlayWalks } from './overlay-walk.mjs';
import {
  CLAIM_BANNER,
  causeOf,
  fromThirdPartyFrame,
  median,
  PLACEHOLDER,
  productReady,
  rankFindings,
  TIMING_SAMPLES,
  timingSuspect,
} from './ready-gate.mjs';
import {
  COLLECT,
  coverRoute,
  followUps,
  pickSamples,
  repoSamples,
  SIGNED_IN_DISCOVERY,
  sitemapPaths,
  strangerDiscovery,
} from './sample-params.mjs';
import { judgeOnQuietReload, wasThrottled } from './throttle.mjs';

const { values: args } = parseArgs({
  options: {
    origin: { type: 'string', default: 'https://jov.ie' },
    out: { type: 'string', default: 'product-crawl' },
    handle: { type: 'string', default: 'tim' },
    'unclaimed-handle': { type: 'string', default: 'testartist' },
    'storage-state': { type: 'string', default: '' },
    sha: { type: 'string', default: process.env.EXPECTED_COMMIT_SHA || '' },
    'deadline-epoch-ms': {
      type: 'string',
      default: process.env.CRAWL_DEADLINE_EPOCH_MS || '',
    },
  },
});

const DEADLINE = Number(args['deadline-epoch-ms']) || Infinity;
const started = Date.now();
const pastDeadline = () => Date.now() >= DEADLINE;
const minutes = () => ((Date.now() - started) / 60_000).toFixed(1);

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};
const SIGN_IN = /^\/(sign-?in|sign-?up|login|signin)(\/|$)/;
// Where a route needs a query to land on its real screen when signed in.
const SIGNED_IN_TARGET = {
  '/onboarding/checkout':
    '/onboarding/checkout?source=intent&plan=pro&interval=month',
};
// Sent only to the crawled origin, never to third parties.
const BYPASS = process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET || '';

const closedInProduction = JSON.parse(
  await readFile('scripts/product-crawl/closed-in-production.json', 'utf8')
).routes;
const inventory = JSON.parse(
  await readFile('docs/product/generated/artist-launch-inventory.json', 'utf8')
);
const routes = [
  ...new Set(
    inventory.inventory.filter(i => i.kind === 'page').map(i => i.route)
  ),
].sort();

/** A dynamic route the crawl can fill from the cert handle alone. */
function concrete(route) {
  if (!route.includes('[')) return route;
  const simple = route.replace(/^\/\[username\]/, `/${args.handle}`);
  return simple.includes('[') ? null : simple;
}

const browser = await chromium.launch();
const pages = [];
const uncovered = [];
const host = new URL(args.origin).host;

async function openContext({ viewport, identity }) {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    ...(identity === 'signed-in'
      ? { storageState: args['storage-state'] }
      : {}),
  });
  if (BYPASS)
    await ctx.route(
      u => u.host === host,
      r =>
        r.continue({
          headers: {
            ...r.request().headers(),
            'x-vercel-protection-bypass': BYPASS,
          },
        })
    );
  return ctx;
}

async function visit({ route, target, viewport, identity, fixture, collect }) {
  const ctx = await openContext({ viewport, identity });
  await ctx.addInitScript(OBSERVE);
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  let thirdPartyConsole = 0;
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // A visitor never sees what Cloudflare's challenge frame logs to itself.
    if (fromThirdPartyFrame(m.location()?.url)) {
      thirdPartyConsole += 1;
      return;
    }
    // Chrome leaves the address out of a failed load's text; add its path.
    const at = m.location()?.url;
    const path =
      at && /^Failed to load resource/.test(m.text())
        ? ` (${new URL(at).pathname})`
        : '';
    consoleErrors.push((m.text() + path).slice(0, 200));
  });
  page.on('pageerror', e => consoleErrors.push(String(e).slice(0, 200)));
  page.on('response', r => {
    const u = new URL(r.url());
    if (
      u.host === host &&
      r.status() >= 400 &&
      r.request().resourceType() !== 'document'
    )
      failedRequests.push(`${r.status()} ${u.pathname}`);
  });
  /** @type {any} */
  const row = { route, url: target, identity, viewport };
  if (fixture === 'unclaimed') row.expectClaimBanner = true;
  const t0 = Date.now();
  try {
    const res = await page.goto(new URL(target, args.origin).href, {
      waitUntil: 'load',
      timeout: 30_000,
    });
    row.loadMs = Date.now() - t0;
    row.status = res?.status() ?? 0;
    const finalPath = new URL(page.url()).pathname;
    row.authGated = SIGN_IN.test(finalPath) && !SIGN_IN.test(target);
    // A load that landed on the sign-in wall is judged only on that fact
    // (ready-gate); the sign-in page itself is crawled as its own route.
    if (row.authGated && !collect) {
      await ctx.close();
      return row;
    }
    await page.waitForTimeout(2500); // let late shifts and stalls land
    const m = await page.evaluate(MEASURE);
    row.cls = Number(m.cls.toFixed(4));
    row.clsSources = Object.entries(m.shifts ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([node, value]) => ({
        node,
        value: Number(value.toFixed(4)),
      }))
      .map(s => {
        const { added, ...move } = m.moves?.[s.node] ?? {};
        const cause = causeOf(added, move.atMs);
        return cause
          ? {
              ...s,
              ...move,
              after: { node: cause.node, h: cause.h, atMs: cause.atMs },
            }
          : { ...s, ...move };
      });
    row.lcpMs = Math.round(m.lcp);
    row.longestTaskMs = Math.round(m.longest);
    if (m.frame) row.frame = m.frame;
    row.placeholder = m.text.match(PLACEHOLDER)?.[0] ?? null;
    row.horizontalOverflow = m.overflow;
    row.overlaySurface = m.overlaySurface;
    if (row.expectClaimBanner) row.claimBanner = CLAIM_BANNER.test(m.text);
    row.consoleErrors = [...new Set(consoleErrors)];
    row.thirdPartyConsole = thirdPartyConsole;
    row.failedRequests = [...new Set(failedRequests)];
    if (collect) row.collected = await page.evaluate(COLLECT);
  } catch (e) {
    row.error = String(e.message || e)
      .split('\n')[0]
      .slice(0, 200);
  }
  await ctx.close();
  return row;
}

// A context that fails to open still gets a row, so the receipt is written.
/** @type {(job: any) => Promise<any>} */
const safeVisit = job =>
  visit(job).catch(e => {
    const { route, target, viewport, identity } = job;
    const error = String(e?.message || e)
      .split('\n')[0]
      .slice(0, 200);
    return { route, url: target, identity, viewport, error };
  });

// Real values for dynamic routes (sample-params.mjs): repo constants, the
// deployed sitemap, and links on pages read first (they are crawled too).
const signedIn = Boolean(args['storage-state']);
const hosts = new Set([host, 'jov.ie', 'www.jov.ie']);
const repo = repoSamples({
  read: p => (existsSync(p) ? readFileSync(p, 'utf8') : null),
  list: d => (existsSync(d) ? readdirSync(d) : []),
  exists: existsSync,
  handle: args.handle,
});
// One retry; a sitemap that still can't be read is named in the receipt and
// on every route it would have sampled (coverRoute), never read as empty.
let sitemapProblem = null;
let sitemap = [];
for (let attempt = 1; attempt <= 2; attempt++) {
  try {
    const res = await fetch(new URL('/sitemap.xml', args.origin), {
      headers: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {},
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sitemap = sitemapPaths(await res.text(), hosts);
    sitemapProblem = null;
    break;
  } catch (error) {
    sitemapProblem = error instanceof Error ? error.message : String(error);
  }
}
if (sitemapProblem) console.warn(`[crawl] /sitemap.xml: ${sitemapProblem}`);
const seen = [];
const look = (target, identity) =>
  safeVisit({
    route: target,
    target,
    viewport: 'desktop',
    identity,
    collect: true,
  }).then(row => row.collected && seen.push({ url: target, ...row.collected }));
const sample = () =>
  pickSamples({
    routes,
    handle: args.handle,
    hosts,
    repo,
    sitemap,
    pages: seen,
  });
await Promise.all([
  ...strangerDiscovery(args.handle).map(t => look(t, 'stranger')),
  ...(signedIn ? SIGNED_IN_DISCOVERY.map(t => look(t, 'signed-in')) : []),
]);
await Promise.all(followUps(sample()).map(t => look(t, 'stranger')));
const samples = sample();

const todo = [];
for (const route of routes) {
  let target = concrete(route);
  if (!target) {
    const cover = coverRoute(route, samples, { signedIn, sitemapProblem });
    if (cover.uncovered) {
      uncovered.push(cover.uncovered);
      continue;
    }
    target = cover.target;
  }
  for (const viewport of Object.keys(VIEWPORTS)) {
    todo.push({ route, target, viewport, identity: 'stranger' });
    if (route === '/[username]' && args['unclaimed-handle'])
      todo.push({
        route,
        target: `/${args['unclaimed-handle']}`,
        viewport,
        identity: 'stranger',
        fixture: 'unclaimed',
      });
    if (skipSignedIn(route) && viewport === 'desktop')
      uncovered.push(
        uncoveredEntry(
          route,
          'not loaded signed in: it could change the test account'
        )
      );
    if (signedIn && !skipSignedIn(route))
      todo.push({
        route,
        target: SIGNED_IN_TARGET[route] ?? target,
        viewport,
        identity: 'signed-in',
      });
  }
}
const jobs = new Map();
let loadsLeft = 0;
for (let i = 0; i < todo.length; i += 4) {
  if (pastDeadline()) {
    loadsLeft = todo.length - i;
    console.warn(
      `[crawl] deadline reached after ${minutes()}m: ${loadsLeft} of ${todo.length} page loads not made`
    );
    break;
  }
  const batch = todo.slice(i, i + 4);
  const rows = await Promise.all(batch.map(safeVisit));
  rows.forEach((row, k) => jobs.set(row, batch[k]));
  pages.push(...rows);
  if ((i / 4) % 25 === 24)
    console.log(
      `[crawl] ${i + batch.length}/${todo.length} page loads, ${minutes()}m`
    );
}
// A page that trips a timing threshold is loaded again, one at a time so the
// other pages' work doesn't count against it, and judged on the median.
let resamplesLeft = 0;
const suspects = pages.filter(timingSuspect);
console.log(
  `[crawl] re-loading ${suspects.length} timing suspects, ${minutes()}m`
);
for (const [k, row] of suspects.entries()) {
  if (pastDeadline()) {
    resamplesLeft = suspects.length - k;
    console.warn(
      `[crawl] deadline reached: ${resamplesLeft} timing suspects judged on one load`
    );
    break;
  }
  const again = [];
  for (let n = 1; n < TIMING_SAMPLES; n += 1) {
    const r = await safeVisit(jobs.get(row));
    if (!r.error) again.push(r);
  }
  if (again.length < TIMING_SAMPLES - 1) continue; // keep the first load's numbers
  const all = [row, ...again];
  row.timingSamples = all.length;
  row.lcpSamplesMs = all.map(r => r.lcpMs);
  row.longestTaskSamplesMs = all.map(r => r.longestTaskMs);
  row.lcpMs = median(row.lcpSamplesMs);
  row.longestTaskMs = median(row.longestTaskSamplesMs);
  // Name the scripts from the load the reported stall came from.
  const at = row.longestTaskSamplesMs.indexOf(row.longestTaskMs);
  const frame = all[at]?.frame;
  if (frame) row.frame = frame;
  else delete row.frame;
}
// A page whose request got a 429 is judged on one quiet reload (throttle.mjs).
const throttled = pages.filter(wasThrottled);
let throttleRechecksLeft = 0;
if (throttled.length && Date.now() + 61_000 < DEADLINE) {
  console.log(
    `[crawl] re-loading ${throttled.length} rate-limited pages after a quiet minute, ${minutes()}m`
  );
  await new Promise(r => setTimeout(r, 61_000));
  for (const [k, row] of throttled.entries()) {
    if (pastDeadline()) {
      throttleRechecksLeft = throttled.length - k;
      break;
    }
    const again = await safeVisit(jobs.get(row));
    if (!again.error) judgeOnQuietReload(row, again);
  }
} else throttleRechecksLeft = throttled.length;
if (throttleRechecksLeft)
  console.warn(
    `[crawl] ${throttleRechecksLeft} rate-limited pages judged without a quiet reload`
  );
// Interaction walks on the pages that have a sidebar or hover triggers.
const overlayWalks = await runOverlayWalks({
  pages,
  origin: args.origin,
  out: args.out,
  openContext,
  pastDeadline,
  skip: skipSignedIn,
});
await browser.close();

const receipt = {
  schema: 'product-crawl/v1',
  origin: args.origin,
  sha: args.sha || null,
  at: new Date().toISOString(),
  routes,
  samples: Object.fromEntries(samples),
  sitemapProblem,
  uncovered,
  closedInProduction,
  outOfTime: loadsLeft || resamplesLeft ? { loadsLeft, resamplesLeft } : null,
  overlayWalks,
  pages,
};
const verdict = productReady(receipt);
await mkdir(args.out, { recursive: true });
await writeFile(
  join(args.out, 'receipt.json'),
  JSON.stringify(receipt, null, 1)
);
await writeFile(
  join(args.out, 'verdict.json'),
  JSON.stringify(verdict, null, 1)
);

const byKind = {};
for (const f of verdict.findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
const lines = [
  `## Product crawl: ${verdict.ready ? 'ready' : 'not ready'}`,
  '',
  `${routes.length} page routes; ${pages.filter(p => p.identity === 'stranger').length} page loads as a stranger, ${pages.filter(p => p.identity === 'signed-in').length} signed in; ${uncovered.filter(u => !u.accepted).length} routes uncovered, ${uncovered.filter(u => u.accepted).length} reviewed exceptions; ${pages.filter(p => p.authGated).length} loads hit the sign-in wall.`,
  '',
  overlayWalkSummary(overlayWalks, signedIn),
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
await writeFile(join(args.out, 'summary.md'), lines.join('\n'));
console.log(lines.join('\n'));
// Every finding, one JSON line each, so the full list survives in the job log.
for (const f of rankFindings(verdict.findings))
  console.log(`crawl-finding ${JSON.stringify(f)}`);
for (const p of pages.filter(x => !x.error && !x.authGated))
  console.log(
    `crawl-page ${JSON.stringify({ route: p.route, url: p.url, identity: p.identity, viewport: p.viewport, status: p.status, cls: p.cls, lcpMs: p.lcpMs, longestTaskMs: p.longestTaskMs, loadMs: p.loadMs })}`
  );
for (const w of overlayWalks.walks)
  console.log(
    `crawl-walk ${JSON.stringify({ route: w.route, url: w.url, identity: w.identity, rail: w.rail, opened: w.opened, steps: w.steps?.length, orphaned: w.steps?.filter(s => s.orphans).length, error: w.error })}`
  );
// The crawl reports; ready-gate.mjs decides. Exit 0 so the receipt uploads.
