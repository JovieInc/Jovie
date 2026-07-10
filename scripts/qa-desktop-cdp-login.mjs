#!/usr/bin/env node
/**
 * Desktop shell login evidence via raw CDP (JOVIE_DEV=1 dev shell).
 *
 * Drives the real email-OTP sign-in inside the Electron window itself, then
 * proves dashboard + settings render for the signed-in user. Raw per-target
 * CDP (global WebSocket) because the shell's remote-debugging hardening
 * stalls playwright's browser-level connectOverCDP. Screenshots via
 * Page.captureScreenshot so the window never needs focus.
 *
 * Usage: node scripts/qa-desktop-cdp-login.mjs --email E --otp 424242 \
 *   --out-dir DIR [--cdp http://127.0.0.1:9223] [--base-url http://localhost:3112]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const cdpUrl = arg('cdp', 'http://127.0.0.1:9223');
const baseUrl = arg('base-url', 'http://localhost:3112');
const email = arg('email');
const otp = arg('otp', '424242');
const outDir = arg('out-dir');
const label = 'desktop-local-cdp-login';

if (!email || !outDir) {
  console.error('usage: --email E --out-dir DIR [--otp CODE]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const result = { label, baseUrl, email, steps: [], ok: false };
function step(id, ok, detail = '') {
  result.steps.push({ id, ok, detail });
  console.log(
    `[${label}] ${ok ? 'ok' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`
  );
}
function finish(code) {
  result.ok = code === 0;
  writeFileSync(
    path.join(outDir, `${label}-result.json`),
    `${JSON.stringify(result, null, 2)}\n`
  );
  process.exit(code);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = event =>
        reject(new Error(`ws error: ${event.message ?? 'unknown'}`));
    });
    this.ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      }
    };
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP ${method} timed out`));
        }
      }, 30_000);
    });
  }
  async eval(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(
        `eval failed: ${response.exceptionDetails.text} ${response.exceptionDetails.exception?.description ?? ''}`.slice(
          0,
          300
        )
      );
    }
    return response.result?.value;
  }
  async shot(name) {
    const response = await this.send('Page.captureScreenshot', {
      format: 'png',
    });
    writeFileSync(
      path.join(outDir, `${name}.png`),
      Buffer.from(response.data, 'base64')
    );
  }
  async waitFor(expression, timeoutMs = 60_000, pollMs = 500) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const value = await this.eval(expression).catch(() => null);
      if (value) return value;
      await sleep(pollMs);
    }
    return null;
  }
}

// React-controlled input fill: native value setter + input event.
const FILL_FN = `function __qaFill(selector, value) {
  const el = document.querySelector(selector);
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}`;

const targets = await (await fetch(`${cdpUrl}/json/list`)).json();
const target =
  targets.find(t => t.type === 'page' && t.url.startsWith(baseUrl)) ??
  targets.find(t => t.type === 'page');
if (!target) {
  step('attach', false, 'no page target');
  finish(1);
}
const cdp = new Cdp(target.webSocketDebuggerUrl);
await cdp.ready;
await cdp.send('Page.enable');
step('attach', true, target.url.slice(0, 120));

try {
  // 1. Navigate to signin and wait for hydrated email input
  await cdp.send('Page.navigate', { url: `${baseUrl}/signin` });
  const inputReady = await cdp.waitFor(
    `!!document.querySelector('input[type="email"]')`,
    90_000
  );
  if (!inputReady) throw new Error('email input never appeared');
  await sleep(3000); // hydration settle
  await cdp.shot('10-shell-signin');
  step('signin-page', true);

  // 2. Request code (retry across hydration resets)
  let codeStep = false;
  for (let attempt = 0; attempt < 3 && !codeStep; attempt++) {
    await cdp.eval(
      `${FILL_FN}; __qaFill('input[type="email"]', ${JSON.stringify(email)})`
    );
    await sleep(300);
    await cdp.eval(
      `(() => { const b = document.querySelector('form button[type="submit"]:not([disabled])'); if (b) b.click(); return !!b; })()`
    );
    codeStep = Boolean(
      await cdp.waitFor(
        `!!document.querySelector("[data-auth-email-code-step='code']")`,
        20_000
      )
    );
  }
  if (!codeStep) {
    await cdp.shot('19-otp-step-missing');
    step('otp-requested', false);
    finish(1);
  }
  step('otp-requested', true);

  // 3. Enter OTP (OtpInput auto-verifies on 6th digit)
  await cdp.eval(
    `${FILL_FN}; __qaFill("[data-testid='otp-autofill-input']", ${JSON.stringify(otp)})`
  );
  const authed = await cdp.waitFor(
    `/\\/app(\\/|$)|\\/onboarding|\\/waitlist|\\/start/.test(location.pathname) ? location.href : null`,
    90_000
  );
  if (!authed) {
    await cdp.shot('19-no-redirect');
    step('authenticated', false, 'no post-auth redirect');
    finish(1);
  }
  await sleep(4000);
  await cdp.shot('11-shell-post-auth');
  step('authenticated', true, authed);

  // 4. Settings shows the signed-in user
  await cdp.send('Page.navigate', {
    url: `${baseUrl}/app/settings/account`,
  });
  const settingsEmail = await cdp.waitFor(
    `(() => {
      const el = document.querySelector("[data-testid='account-identity-email']");
      if (el) return el.textContent.trim();
      return document.body && document.body.innerText.includes(${JSON.stringify(email)}) ? ${JSON.stringify(email)} : null;
    })()`,
    60_000
  );
  await sleep(1500);
  await cdp.shot('12-shell-settings');
  result.settingsEmail = settingsEmail;
  const ok =
    typeof settingsEmail === 'string' &&
    settingsEmail.toLowerCase() === email.toLowerCase();
  step('settings-identity', ok, `saw: ${settingsEmail}`);
  finish(ok ? 0 : 1);
} catch (error) {
  result.error = String(error).slice(0, 800);
  await cdp.shot('19-failure').catch(() => {});
  step('fatal', false, result.error);
  finish(1);
}
