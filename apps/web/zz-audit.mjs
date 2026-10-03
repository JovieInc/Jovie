// Temporary certification audit driver (not committed).
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium, devices } from '@playwright/test';

const OUT = process.env.OUT;
const BASE = process.env.BASE || 'https://jov.ie';
const routes = JSON.parse(process.env.ROUTES);
const viewports = [
  { id: 'desktop', opts: { viewport: { width: 1440, height: 900 } } },
  { id: 'mobile', opts: { ...devices['iPhone 13'] } },
];
await mkdir(path.join(OUT, 'shots'), { recursive: true });
const browser = await chromium.launch();
const results = [];
for (const route of routes) {
  for (const vp of viewports) {
    const ctx = await browser.newContext({ ...vp.opts, ignoreHTTPSErrors: false });
    await ctx.addInitScript(() => {
      window.__cls = 0;
      window.__lcp = 0;
      new PerformanceObserver(l => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(l => {
        const es = l.getEntries();
        window.__lcp = es[es.length - 1].startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failed = [];
    page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 240)));
    page.on('pageerror', e => pageErrors.push(e.message.slice(0, 240)));
    page.on('response', r => {
      const u = r.url();
      if (r.status() >= 400 && (u.startsWith(BASE) || /\.(png|jpe?g|webp|avif|svg|js|css)(\?|$)/.test(u)))
        failed.push(`${r.status()} ${u.slice(0, 160)}`);
    });
    const rec = { route, viewport: vp.id };
    try {
      const t0 = Date.now();
      const resp = await page.goto(BASE + route, { waitUntil: 'load', timeout: 45000 });
      rec.status = resp?.status();
      rec.finalUrl = page.url();
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      rec.loadMs = Date.now() - t0;
      rec.cls = await page.evaluate(() => Number(window.__cls.toFixed(4)));
      rec.lcpMs = await page.evaluate(() => Math.round(window.__lcp));
      rec.meta = await page.evaluate(() => {
        const q = s => document.querySelector(s);
        const a = (s, k = 'content') => q(s)?.getAttribute(k) ?? null;
        return {
          title: document.title,
          description: a('meta[name="description"]'),
          canonical: a('link[rel="canonical"]', 'href'),
          robots: a('meta[name="robots"]'),
          ogTitle: a('meta[property="og:title"]'),
          ogImage: a('meta[property="og:image"]'),
          twitterCard: a('meta[name="twitter:card"]'),
          h1: [...document.querySelectorAll('h1')].map(h => h.innerText.trim().slice(0, 80)),
          lang: document.documentElement.lang,
          jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
        };
      });
      rec.xRobots = resp?.headers()['x-robots-tag'] ?? null;
      rec.overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const text = await page.evaluate(() => document.body.innerText);
      rec.emDashes = (text.match(/[^\n]{0,40}—[^\n]{0,40}/g) || []).slice(0, 5);
      rec.loremOrTodo = (text.match(/lorem ipsum|TODO|undefined|NaN|\[object Object\]/gi) || []).slice(0, 5);
      rec.links = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('a[href]')].map(a => a.href))].filter(h => h.startsWith('http'))
      );
      rec.brokenImages = await page.evaluate(() =>
        [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src).map(i => i.src.slice(0, 160))
      );
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      rec.axe = axe.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') }));
      const shot = `${route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}-${vp.id}.png`;
      await page.screenshot({ path: path.join(OUT, 'shots', shot), fullPage: false });
      rec.screenshot = `shots/${shot}`;
    } catch (e) {
      rec.error = String(e.message).slice(0, 300);
    }
    rec.consoleErrors = consoleErrors;
    rec.pageErrors = pageErrors;
    rec.failedResponses = [...new Set(failed)];
    results.push(rec);
    console.log(`${rec.status ?? 'ERR'} ${vp.id} ${route} cls=${rec.cls} lcp=${rec.lcpMs} axe=${rec.axe?.length} ce=${consoleErrors.length} pe=${pageErrors.length} fr=${rec.failedResponses.length}${rec.error ? ' ERROR ' + rec.error : ''}`);
    await ctx.close();
  }
}
await browser.close();
await writeFile(path.join(OUT, `results-${process.env.TAG || 'run'}.json`), JSON.stringify(results, null, 2));
