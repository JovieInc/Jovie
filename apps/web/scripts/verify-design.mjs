import { chromium } from 'playwright';

const CARBON_PALETTE = {
  '--linear-bg-page': '#06070a',
  '--linear-bg-surface-0': '#0a0b0e',
  '--linear-bg-surface-1': '#101216',
  '--linear-bg-surface-2': '#161a20',
  '--linear-app-content-surface': '#0a0c0f',
  '--linear-app-shell-border': '#171a20',
};

function rgbStringToHex(value) {
  if (!value) return null;
  const v = value.trim();
  if (v.startsWith('#')) return v.toLowerCase();
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return v;
  const parts = m[1].split(/[\s,]+/).filter(Boolean).map(Number);
  const [r, g, b] = parts;
  return (
    '#' +
    [r, g, b]
      .map(n => n.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase()
  );
}

async function getTokensFromMain(page) {
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
  });
  await page.waitForTimeout(600);
  return page.evaluate(vars => {
    const root = document.documentElement;
    const main = document.querySelector('main') || document.body;
    const cs = getComputedStyle(main);
    const out = {};
    for (const v of vars) {
      out[v] = cs.getPropertyValue(v).trim();
    }
    out.__main_tag = main.tagName;
    out.__html_class = root.className;
    return out;
  }, Object.keys(CARBON_PALETTE));
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'dark',
});
const page = await context.newPage();

// 1) shell-v1 — read tokens that include the inline override on the wrapper
console.log('--- shell-v1 ---');
await page.goto('http://localhost:3100/exp/shell-v1', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});
const shellTokens = await getTokensFromMain(page);
console.log(JSON.stringify(shellTokens, null, 2));
await page.screenshot({
  path: '/tmp/design-verify/shell-v1.png',
  fullPage: false,
});

// 2) Auth bypass for app routes — must visit the bypass route, then navigate.
console.log('--- auth bootstrap ---');
const authResp = await page.goto(
  'http://localhost:3100/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/dashboard/earnings',
  { waitUntil: 'load', timeout: 60000 }
);
console.log(`auth resp status: ${authResp?.status()}`);
console.log(`landed at: ${page.url()}`);

// Sometimes the bypass redirects to the app route; wait for full load.
await page
  .waitForLoadState('networkidle', { timeout: 30000 })
  .catch(() => null);

// 3) Capture the dashboard
console.log('--- /app/dashboard/earnings ---');
const dashTokens = await getTokensFromMain(page);
console.log(JSON.stringify(dashTokens, null, 2));
await page.screenshot({
  path: '/tmp/design-verify/app-dashboard.png',
  fullPage: false,
});

// 4) Releases route
console.log('--- /app/dashboard/releases ---');
await page
  .goto('http://localhost:3100/app/dashboard/releases', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  })
  .catch(err => console.log('nav err:', err.message));
await page
  .waitForLoadState('networkidle', { timeout: 20000 })
  .catch(() => null);
const relTokens = await getTokensFromMain(page);
console.log(JSON.stringify(relTokens, null, 2));
await page.screenshot({
  path: '/tmp/design-verify/app-releases.png',
  fullPage: false,
});

await browser.close();

console.log('\n=== TOKEN PARITY ===');
const targets = {
  'shell-v1': shellTokens,
  'app-dashboard': dashTokens,
  'app-releases': relTokens,
};

let mismatches = 0;
for (const [varName, expected] of Object.entries(CARBON_PALETTE)) {
  for (const [name, tokens] of Object.entries(targets)) {
    const actual = tokens[varName];
    const actualHex = rgbStringToHex(actual);
    const ok =
      actualHex && actualHex.toLowerCase() === expected.toLowerCase();
    console.log(
      `${ok ? '✓' : '✗'} ${name.padEnd(14)} ${varName.padEnd(34)} = ${actual}${ok ? '' : ` (expected ${expected})`}`
    );
    if (!ok) mismatches++;
  }
}
console.log(`\nTotal mismatches: ${mismatches}`);
process.exit(mismatches > 0 ? 1 : 0);
