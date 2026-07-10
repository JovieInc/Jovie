#!/usr/bin/env node
/**
 * Complete the desktop PKCE auth handoff for the JOVIE_DEV=1 dev shell.
 *
 * 1. Reads the shell's live /desktop-auth?auth_url=… (its pending PKCE) via CDP
 * 2. Signs in with the deterministic OTP in a Playwright browser
 * 3. Runs the auth_url → /auth/native-return, builds the
 *    jovie-local://auth/complete deep link
 * 4. Delivers it to the dev shell binary via `open -a` (Launch Services would
 *    otherwise route the scheme to the packaged Jovie Local.app)
 * 5. Waits for the shell to land signed-in
 *
 * Usage: node scripts/qa-desktop-handoff-complete.mjs --email E [--otp 424242]
 *   [--cdp http://127.0.0.1:9223] [--base-url http://localhost:3112]
 *   [--electron-app <path to dev Electron.app>]
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { chromium } from 'playwright';

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const cdpUrl = arg('cdp', 'http://127.0.0.1:9223');
const baseUrl = arg('base-url', 'http://localhost:3112');
const email = arg('email');
const otp = arg('otp', '424242');
const electronApp = arg(
  'electron-app',
  `${process.cwd()}/node_modules/.pnpm/electron@42.4.0/node_modules/electron/dist/Electron.app`
);
if (!email) {
  console.error('usage: --email E');
  process.exit(2);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (id, detail = '') =>
  console.log(`[handoff] ${id}${detail ? ` — ${detail}` : ''}`);

// 1. Live PKCE auth URL from the shell window. If the shell is not on the
// handoff, trigger it the way the app does: navigating to /signin with an
// electron-runtime redirect makes the main process build the central PKCE
// URL and swap the window to /desktop-auth?auth_url=….
async function listPages() {
  return (await (await fetch(`${cdpUrl}/json/list`)).json()).filter(
    t => t.type === 'page'
  );
}
async function navigateTarget(target, url) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error('ws error'));
  });
  ws.send(JSON.stringify({ id: 1, method: 'Page.navigate', params: { url } }));
  await sleep(500);
  ws.close();
}
let handoffTarget = (await listPages()).find(t =>
  t.url.includes('/desktop-auth?auth_url=')
);
if (!handoffTarget) {
  const mainTarget = (await listPages()).find(t => t.url.startsWith(baseUrl));
  if (!mainTarget) {
    console.error('shell has no page target');
    process.exit(1);
  }
  const trigger = `${baseUrl}/signin?redirect_url=${encodeURIComponent('/app/chat?runtime=electron')}`;
  await navigateTarget(mainTarget, trigger);
  const deadline = Date.now() + 20_000;
  let bridgeFired = false;
  while (Date.now() < deadline && !handoffTarget) {
    await sleep(1000);
    const pages = await listPages();
    handoffTarget = pages.find(t => t.url.includes('/desktop-auth?auth_url='));
    if (!handoffTarget && !bridgeFired) {
      // In-page route handoff: ask the preload bridge to open the real
      // handoff window carrying the PKCE auth_url (same call the UI makes).
      const routeTarget = pages.find(t => t.url.includes('/signin'));
      if (routeTarget) {
        const ws = new WebSocket(routeTarget.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.onopen = resolve;
          ws.onerror = () => reject(new Error('ws error'));
        });
        const fired = await new Promise(resolve => {
          ws.onmessage = event => {
            const message = JSON.parse(event.data);
            if (message.id === 2) {
              resolve(message.result?.result?.value ?? null);
            }
          };
          ws.send(
            JSON.stringify({
              id: 2,
              method: 'Runtime.evaluate',
              params: {
                expression: `(async () => {
                  if (!document.querySelector("[data-testid='desktop-auth-route-handoff'], [data-testid='desktop-auth-handoff']")) return 'no-handoff-dom';
                  if (!window.electronAPI?.startDesktopAuthHandoff) return 'no-bridge';
                  const r = await window.electronAPI.startDesktopAuthHandoff(window.location.href);
                  return r?.ok ? 'ok' : ('failed:' + (r?.reason ?? 'unknown'));
                })()`,
                awaitPromise: true,
                returnByValue: true,
              },
            })
          );
          setTimeout(() => resolve(null), 10_000);
        });
        ws.close();
        if (fired === 'ok') bridgeFired = true;
        else if (fired && fired !== 'no-handoff-dom') {
          console.error(`bridge start failed: ${fired}`);
        }
      }
    }
  }
}
if (!handoffTarget) {
  console.error('shell never reached the desktop-auth handoff screen');
  process.exit(1);
}
const authUrlParam = new URL(handoffTarget.url).searchParams.get('auth_url');
const authStartUrl = new URL(authUrlParam, baseUrl).toString();
log('pkce-auth-url', authStartUrl.slice(0, 110));

// 2. Sign in with OTP in a private browser
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();
await page.goto(`${baseUrl}/signin`, {
  waitUntil: 'domcontentloaded',
  timeout: 90_000,
});
const emailInput = page.locator('input[type="email"]').first();
await emailInput.waitFor({ state: 'visible', timeout: 60_000 });
await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
let codeStep = false;
for (let attempt = 0; attempt < 3 && !codeStep; attempt++) {
  await emailInput.fill(email);
  await page
    .locator('form button[type="submit"]')
    .first()
    .click({ timeout: 15_000 })
    .catch(() => {});
  codeStep = await page
    .locator("[data-auth-email-code-step='code']")
    .waitFor({ state: 'visible', timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
}
if (!codeStep) {
  console.error('OTP step never appeared');
  process.exit(1);
}
const navigated = page.waitForURL(/\/app|\/waitlist|\/start/, {
  timeout: 90_000,
});
await page.locator("[data-testid='otp-autofill-input']").fill(otp);
await page
  .locator("form button[type='submit']:not([disabled])")
  .first()
  .click({ timeout: 8_000 })
  .catch(() => {});
await navigated;
log('browser-signed-in', page.url());

// 3. Run the PKCE start URL → native-return
await page.goto(authStartUrl, {
  waitUntil: 'domcontentloaded',
  timeout: 90_000,
});
await page
  .waitForURL(/\/auth\/native-return\?/, { timeout: 60_000 })
  .catch(() => {});
const returnUrl = new URL(page.url());
const code = returnUrl.searchParams.get('code');
const state = returnUrl.searchParams.get('state');
const desktopFlow = returnUrl.searchParams.get('desktop_flow');
await browser.close();
if (!code || !state) {
  console.error(
    `native-return did not yield code/state; landed on ${returnUrl}`
  );
  process.exit(1);
}
const deepLink = new URL('jovie-local://auth/complete');
deepLink.searchParams.set('code', code);
deepLink.searchParams.set('state', state);
if (desktopFlow) deepLink.searchParams.set('desktop_flow', desktopFlow);
log('deep-link', `${deepLink.toString().slice(0, 80)}…`);

// 4. Deliver to the dev shell binary specifically
execFileSync('open', ['-a', electronApp, deepLink.toString()], {
  stdio: 'ignore',
});
log('deep-link-delivered');

// 5. Wait for the shell to leave the handoff screen signed-in
const deadline = Date.now() + 60_000;
let shellUrl = null;
while (Date.now() < deadline) {
  const now = await (await fetch(`${cdpUrl}/json/list`)).json();
  const appPage = now.find(
    t => t.type === 'page' && /\/app(\/|\?|$)|native-complete/.test(t.url)
  );
  if (appPage) {
    shellUrl = appPage.url;
    break;
  }
  await sleep(1000);
}
if (!shellUrl) {
  console.error('shell never reached a signed-in route');
  process.exit(1);
}
log('shell-signed-in', shellUrl.slice(0, 110));
