#!/usr/bin/env node
// Crawl every page route the app ships, as a stranger, and write a receipt
// that ready-gate.mjs judges. Usage:
//   node scripts/product-crawl/crawl.mjs --origin https://jov.ie --out <dir>
// Desktop (1440x900) and phone (390x844). Measures layout shift, LCP, the
// longest main-thread stall, load time, console errors, failed same-origin
// requests, placeholder text and sideways scroll. Signed-in pages are
// recorded as behind the sign-in wall; a signed-in crawl is a later slice.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { PLACEHOLDER, productReady, rankFindings } from './ready-gate.mjs';

const { values: args } = parseArgs({
  options: {
    origin: { type: 'string', default: 'https://jov.ie' },
    out: { type: 'string', default: 'product-crawl' },
    handle: { type: 'string', default: 'tim' },
    sha: { type: 'string', default: process.env.EXPECTED_COMMIT_SHA || '' },
  },
});

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
};
const SIGN_IN = /^\/(sign-?in|sign-?up|login|signin)(\/|$)/;

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

async function visit(route, viewport) {
  const target = concrete(route);
  const ctx = await browser.newContext({ viewport: VIEWPORTS[viewport] });
  await ctx.addInitScript(OBSERVE);
  const page = await ctx.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
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
  const row = { route, url: target, identity: 'stranger', viewport };
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
    row.consoleErrors = [...new Set(consoleErrors)];
    row.failedRequests = [...new Set(failedRequests)];
  } catch (e) {
    row.error = String(e.message || e)
      .split('\n')[0]
      .slice(0, 200);
  }
  pages.push(row);
  await ctx.close();
}

const todo = [];
for (const route of routes) {
  if (!concrete(route)) {
    uncovered.push({ route, reason: 'needs sample data for its parameters' });
    continue;
  }
  for (const viewport of Object.keys(VIEWPORTS)) todo.push([route, viewport]);
}
for (let i = 0; i < todo.length; i += 4)
  await Promise.all(todo.slice(i, i + 4).map(([r, v]) => visit(r, v)));
await browser.close();

const receipt = {
  schema: 'product-crawl/v1',
  origin: args.origin,
  sha: args.sha || null,
  at: new Date().toISOString(),
  routes,
  uncovered,
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
  `${routes.length} page routes; ${pages.length} page loads as a stranger; ${uncovered.length} routes need sample data; ${pages.filter(p => p.authGated).length} loads hit the sign-in wall.`,
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
    `crawl-page ${JSON.stringify({ route: p.route, viewport: p.viewport, status: p.status, cls: p.cls, lcpMs: p.lcpMs, longestTaskMs: p.longestTaskMs, loadMs: p.loadMs })}`
  );
// The crawl reports; ready-gate.mjs decides. Exit 0 so the receipt uploads.
