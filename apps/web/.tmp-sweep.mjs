import { chromium } from '@playwright/test';

const out = process.argv[2];
const routes = [
  '/',
  '/artist-profiles',
  '/smart-links',
  '/pricing',
  '/artist-notifications',
  '/pay',
  '/product',
  '/about',
  '/solutions/artists',
  '/launch',
  '/card',
  '/voice',
  '/instant-merch',
  '/youtube-thumbnails',
  '/integrations',
  '/download',
  '/compare',
  '/compare/linktree',
  '/alternatives',
  '/alternatives/linktree',
  '/ai',
  '/support',
  '/developers',
  '/cli',
  '/demo/video',
  '/waitlist',
  '/product/command-palette',
  '/product/dsp-links',
  '/product/isrc',
  '/product/link-analytics',
  '/product/pre-save',
  '/product/release-scheduling',
  '/product/utm-links',
];
const widths = [390, 1440, 1920];
const browser = await chromium.launch();
for (const r of routes) {
  for (const w of widths) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: w === 390 ? 844 : 1000 },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    const name =
      (r === '/' ? 'home' : r.slice(1).replaceAll('/', '_')) + `-${w}`;
    try {
      await page.goto('https://jov.ie' + r, {
        waitUntil: 'load',
        timeout: 60000,
      });
      // reveal lazy content
      const h = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y < Math.min(h, 20000); y += 700) {
        await page.evaluate(v => window.scrollTo(0, v), y);
        await page.waitForTimeout(120);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(800);
      // above-the-fold shot (with cookie banner as a real visitor sees it)
      await page.screenshot({ path: `${out}/${name}-fold.png` });
      // full page, banner hidden, capped height
      await page.addStyleTag({
        content:
          '[data-testid*="cookie" i],[class*="cookie-banner" i]{display:none!important}',
      });
      await page.screenshot({
        path: `${out}/${name}-full.png`,
        fullPage: true,
      });
      const canvas = await page.evaluate(
        () => document.querySelectorAll('canvas').length
      );
      console.log(JSON.stringify({ route: r, w, canvas }));
    } catch (e) {
      console.log(
        JSON.stringify({ route: r, w, error: String(e).slice(0, 120) })
      );
    }
    await ctx.close();
  }
}
await browser.close();
