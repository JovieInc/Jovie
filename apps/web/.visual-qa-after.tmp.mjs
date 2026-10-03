import { chromium } from '@playwright/test';
const out = process.argv[2];
const width = Number(process.argv[3] ?? 1512);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 949 }, deviceScaleFactor: 2 });
await page.addInitScript(() => {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {} });
  const mark = () => { const r = document.documentElement; r.dataset.desktopRuntime = 'electron'; r.dataset.electronPlatform = 'darwin'; };
  mark(); document.addEventListener('DOMContentLoaded', mark);
});
await page.goto('http://localhost:3417/api/dev/test-auth/enter?persona=admin&redirect=%2Fapp%2Fov%2Fpeople', { timeout: 240000, waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-app-shell-frame="true"] main, [data-app-shell-scroll]', { timeout: 240000 }).catch(() => {});
await page.waitForTimeout(8000);
const real = await page.$$eval('[data-window-edge-banner="true"]', els => els.map(e => ({ t: e.textContent?.slice(0,60), vis: e.getBoundingClientRect().height })));
await page.evaluate(() => { const r=document.documentElement; r.dataset.desktopRuntime='electron'; r.dataset.electronPlatform='darwin'; });
await page.waitForTimeout(500);
console.log('sw', await page.evaluate(() => { const w=document.querySelector('[data-sidebar-wrapper]'); const slot=document.querySelector('[data-dashboard-shell-slot]'); return JSON.stringify({w: !!w, h: w && getComputedStyle(w).height, slot: !!slot, cls: w?.className?.slice(0,80)}); }));
console.log('attrs', await page.evaluate(() => JSON.stringify({rt: document.documentElement.dataset.desktopRuntime, pf: document.documentElement.dataset.electronPlatform, api: typeof window.electronAPI, parent: document.querySelector('[data-window-edge-banner]')?.parentElement?.className, pl: getComputedStyle(document.querySelector('[data-window-edge-banner]')).paddingLeft })));
console.log('chain', await page.evaluate(() => { const out=[]; let el=document.querySelector('[data-app-shell-frame="true"]'); while (el && el !== document.body) { const r=el.getBoundingClientRect(); out.push(`${el.tagName}.${(el.className||'').toString().slice(0,70)} top=${r.top} h=${r.height}`); el=el.parentElement; } return out.join('\n'); }));
console.log('realBanners', JSON.stringify(real));
if (!real.some(b => b.vis > 0)) {
  await page.evaluate(() => {
    const shell = document.querySelector('[data-app-shell-frame="true"]');
    const column = shell?.closest('.flex.h-full.flex-col') ?? shell?.parentElement?.parentElement;
    const bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.setAttribute('data-window-edge-banner', 'true');
    bar.className = 'flex min-h-10 items-center gap-3 border-b border-subtle bg-surface-1 px-4 py-2 text-sm text-secondary-token';
    bar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg><span class="min-w-0 flex-1 truncate">Sign in again to set up a passkey.</span><button class="rounded-md bg-surface-2 px-3 py-1 text-xs text-primary-token">Try again</button>';
    column?.insertBefore(bar, column.firstChild);
    console.log('inserted into', column?.className);
  });
}
const banner = await page.$('[data-window-edge-banner="true"]');
console.log('url', page.url(), 'banner', !!banner);
if (banner) console.log('bannerBox', JSON.stringify(await banner.boundingBox()), 'textLeft', await banner.evaluate(el => el.querySelector('span')?.getBoundingClientRect().left));
const frame = await page.$('[data-app-shell-frame="true"]');
if (frame) console.log('frameBottom', (await frame.boundingBox()).y + (await frame.boundingBox()).height, 'viewport', 949);
// Draw the native traffic-light geometry (x=20,y=17, 3x14px + 6px gaps) so the overlap is visible in a web capture.
await page.evaluate(() => { for (const [i,c] of ['#ff5f57','#febc2e','#28c840'].entries()) { const d=document.createElement('div'); Object.assign(d.style,{position:'fixed',left:(20+i*20)+'px',top:'17px',width:'14px',height:'14px',borderRadius:'7px',background:c,zIndex:2147483647}); document.body.appendChild(d);} });
await page.screenshot({ path: out });
await browser.close();
