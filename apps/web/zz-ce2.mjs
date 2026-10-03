import { chromium } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const t0 = Date.now();
p.on('console', async m => {
  if (m.type() !== 'error') return;
  console.log(((Date.now()-t0)/1000).toFixed(1)+'s', m.text().slice(0,80), JSON.stringify(m.location()));
});
await p.goto('https://jov.ie/pricing', { waitUntil: 'load' });
await p.waitForTimeout(20000);
await b.close();
