import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
const cdp = await p.context().newCDPSession(p);
await cdp.send('Runtime.enable');
let n = 0;
cdp.on('Runtime.consoleAPICalled', e => {
  if (e.type !== 'error' || n++ > 1) return;
  console.log(JSON.stringify(e.args.map(a => a.value ?? a.description).slice(0, 4)));
  console.log(JSON.stringify(e.stackTrace?.callFrames?.slice(0, 5).map(f => `${f.functionName}@${f.url}:${f.lineNumber}`)));
});
await p.goto('https://jov.ie/pricing', { waitUntil: 'load' });
await p.waitForTimeout(3000);
console.log('--- axe');
await new AxeBuilder({ page: p }).analyze();
await p.waitForTimeout(1000);
await b.close();
