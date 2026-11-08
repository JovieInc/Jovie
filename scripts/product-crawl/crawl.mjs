#!/usr/bin/env node
// Crawl every page route the app ships, as a stranger and (given a saved
// session) signed in, and write a receipt that ready-gate.mjs judges. Usage:
//   node scripts/product-crawl/crawl.mjs --origin https://jov.ie --out <dir>
//     [--storage-state <signed-in Playwright state>] [--unclaimed-handle testartist]
// Desktop (1440x900) and phone (390x844). Measures layout shift, LCP, the
// longest main-thread stall, load time, console errors, failed same-origin
// requests, placeholder text and sideways scroll. The public profile is also
// crawled on an unclaimed test profile, where the claim banner must show.
// The crawl only loads pages: it never clicks, submits or pays.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { skipSignedIn, uncoveredEntry } from './accepted-uncovered.mjs';
import {
  CLAIM_BANNER,
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

const { values: args } = parseArgs({
  options: {
    origin: { type: 'string', default: 'https://jov.ie' },
    out: { type: 'string', default: 'product-crawl' },
    handle: { type: 'string', default: 'tim' },
    'unclaimed-handle': { type: 'string', default: 'testartist' },
    'storage-state': { type: 'string', default: '' },
    sha: { type: 'string', default: process.env.EXPECTED_COMMIT_SHA || '' },
  },
});

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

// Runs in the page, so it is a string: these scripts type-check as Node.
const OBSERVE = `
  window.__crawl = { cls: 0, lcp: 0, longest: 0 };
  const watch = (type, fn) => new PerformanceObserver(l => l.getEntries().forEach(fn)).observe({ type, buffered: true });
  watch('layout-shift', e => { if (!e.hadRecentInput) window.__crawl.cls += e.value; });
  watch('largest-contentful-paint', e => { window.__crawl.lcp = Math.max(window.__crawl.lcp, e.startTime); });
  watch('longtask', e => { window.__crawl.longest = Math.max(window.__crawl.longest, e.duration); });
`;
const MEASURE = `({ ...window.__crawl, text: document.body?.innerText ?? '',
  overflow: document.documentElement.scrollWidth > window.innerWidth + 1 })`;

const browser = await chromium.launch();
const pages = [];
const uncovered = [];
const host = new URL(args.origin).host;

async function visit({ route, target, viewport, identity, fixture, collect }) {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    ...(identity === 'signed-in'
      ? { storageState: args['storage-state'] }
      : {}),
  });
  await ctx.addInitScript(OBSERVE);
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
    consoleErrors.push(m.text().slice(0, 200));
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
    await page.waitForTimeout(2500); // let late shifts and stalls land
    row.status = res?.status() ?? 0;
    const finalPath = new URL(page.url()).pathname;
    row.authGated = SIGN_IN.test(finalPath) && !SIGN_IN.test(target);
    const m = await page.evaluate(MEASURE);
    row.cls = Number(m.cls.toFixed(4));
    row.lcpMs = Math.round(m.lcp);
    row.longestTaskMs = Math.round(m.longest);
    row.placeholder = m.text.match(PLACEHOLDER)?.[0] ?? null;
    row.horizontalOverflow = m.overflow;
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
const sitemap = await fetch(new URL('/sitemap.xml', args.origin), {
  headers: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {},
})
  .then(r => (r.ok ? r.text() : ''))
  .then(xml => sitemapPaths(xml, hosts))
  .catch(() => []);
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
    const cover = coverRoute(route, samples, { signedIn });
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
for (let i = 0; i < todo.length; i += 4) {
  const batch = todo.slice(i, i + 4);
  const rows = await Promise.all(batch.map(safeVisit));
  rows.forEach((row, k) => jobs.set(row, batch[k]));
  pages.push(...rows);
}
// A page that trips a timing threshold is loaded again, one at a time so the
// other pages' work doesn't count against it, and judged on the median.
for (const row of pages.filter(timingSuspect)) {
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
}
await browser.close();

const receipt = {
  schema: 'product-crawl/v1',
  origin: args.origin,
  sha: args.sha || null,
  at: new Date().toISOString(),
  routes,
  samples: Object.fromEntries(samples),
  uncovered,
  closedInProduction,
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
// The crawl reports; ready-gate.mjs decides. Exit 0 so the receipt uploads.
