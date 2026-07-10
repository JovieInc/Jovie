#!/usr/bin/env node
/**
 * Live web auth evidence driver (six-target matrix, web cells).
 *
 * Drives the real /signin email-OTP UI with Playwright, then proves the
 * dashboard settings page shows the signed-in user. Writes screenshots +
 * result JSON under --out-dir for the qa:auth:exhaustive evidence manifest.
 *
 * OTP sources:
 *   --otp 424242          deterministic E2E code (local, E2E_TEST_MODE=1)
 *   --otp-file /tmp/x.txt poll a file an operator/agent writes after reading
 *                         the mailbox (staging/production via Gmail)
 *
 * Usage:
 *   node scripts/qa-auth-live-driver.mjs \
 *     --base-url http://localhost:3112 --email qa+e2e+local@timwhite.co \
 *     --otp 424242 --out-dir artifacts/auth-qa/<run>/web-local \
 *     --label web-local-signup
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const baseUrl = arg('base-url');
const email = arg('email');
const otpLiteral = arg('otp');
const otpFile = arg('otp-file');
const outDir = arg('out-dir');
const label = arg('label', 'web-target');
const settingsPath = arg('settings-path', '/app/settings/account');

if (!baseUrl || !email || !outDir || (!otpLiteral && !otpFile)) {
  console.error(
    'usage: --base-url URL --email E --otp CODE|--otp-file PATH --out-dir DIR [--label L]'
  );
  process.exit(2);
}

mkdirSync(outDir, { recursive: true });

const result = {
  label,
  baseUrl,
  email,
  startedAt: new Date().toISOString(),
  steps: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  screenshots: [],
  ok: false,
};

function step(id, ok, detail = '') {
  result.steps.push({ id, ok, detail, at: new Date().toISOString() });
  console.log(
    `[${label}] ${ok ? 'ok' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`
  );
}

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  result.screenshots.push(file);
  return file;
}

async function pollOtp(timeoutMs = 240_000) {
  if (otpLiteral) return otpLiteral;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const raw = readFileSync(otpFile, 'utf8').trim();
      const match = raw.match(/\b(\d{6})\b/);
      if (match) return match[1];
    } catch {
      // not written yet
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return null;
}

function finish(code) {
  result.finishedAt = new Date().toISOString();
  result.ok = code === 0;
  writeFileSync(
    path.join(outDir, `${label}-result.json`),
    `${JSON.stringify(result, null, 2)}\n`
  );
  process.exit(code);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

page.on('console', message => {
  if (message.type() === 'error') {
    result.consoleErrors.push(message.text().slice(0, 500));
  }
});
page.on('pageerror', error => {
  result.pageErrors.push(String(error).slice(0, 500));
});
page.on('response', response => {
  const status = response.status();
  if (status >= 400 && response.url().startsWith(baseUrl)) {
    result.failedRequests.push({ url: response.url(), status });
  }
});
result.navLog = [];
page.on('framenavigated', frame => {
  if (frame === page.mainFrame() && result.navLog.length < 60) {
    result.navLog.push({ url: frame.url(), at: new Date().toISOString() });
  }
});
result.postLog = [];
page.on('response', response => {
  const request = response.request();
  if (
    request.method() === 'POST' &&
    response.url().startsWith(baseUrl) &&
    result.postLog.length < 60
  ) {
    result.postLog.push({
      url: response.url().slice(0, 160),
      status: response.status(),
      actionRedirect: response.headers()['x-action-redirect'] ?? null,
    });
  }
});

try {
  // 1. Sign-in page
  await page.goto(`${baseUrl}/signin`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  const emailInput = page.locator('input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 60_000 });
  await shot(page, '01-signin');
  step('signin-page', true);

  // 2. Request code (hydration-safe: a fill that lands pre-hydration gets
  // reset by React, leaving the submit disabled — refill and retry).
  await page
    .waitForLoadState('networkidle', { timeout: 45_000 })
    .catch(() => {});
  let codeStepVisible = false;
  for (let attempt = 0; attempt < 3 && !codeStepVisible; attempt++) {
    await emailInput.fill(email);
    await page
      .locator('form button[type="submit"]')
      .first()
      .click({ timeout: 15_000 })
      .catch(() => {});
    codeStepVisible = await page
      .locator("[data-auth-email-code-step='code']")
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!codeStepVisible) {
    await shot(page, '02-otp-step-missing');
    step('otp-requested', false, 'code step never appeared');
    finish(1);
  }
  await shot(page, '02-otp-step');
  step('otp-requested', true);

  // 3. Obtain + enter code
  const otp = await pollOtp();
  if (!otp) {
    await shot(page, '03-otp-missing');
    step('otp-obtained', false, 'no OTP within timeout');
    finish(1);
  }
  step('otp-obtained', true);
  const otpInput = page.locator("[data-testid='otp-autofill-input']");
  if (await otpInput.count()) {
    await otpInput.fill(otp);
  } else {
    // Fallback: type into the first visible numeric input group.
    await page.locator("input[inputmode='numeric']").first().click();
    await page.keyboard.type(otp, { delay: 60 });
  }
  await shot(page, '03-otp-filled');
  // OtpInput auto-verifies once 6 digits land; the Verify click is a fallback
  // and may race the post-auth navigation, so it is best-effort.
  const navigated = page.waitForURL(/\/app(\/|$)|\/onboarding/, {
    timeout: 90_000,
  });
  await page
    .locator("form button[type='submit']:not([disabled])")
    .first()
    .click({ timeout: 8_000 })
    .catch(() => {});

  // 4. Authenticated redirect
  await navigated;
  await page
    .waitForLoadState('networkidle', { timeout: 60_000 })
    .catch(() => {});
  await shot(page, '04-post-auth');
  step('authenticated-redirect', true, page.url());

  // 5. Settings shows the signed-in user
  await page.goto(`${baseUrl}${settingsPath}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await page
    .waitForLoadState('networkidle', { timeout: 60_000 })
    .catch(() => {});
  const identity = page.locator("[data-testid='account-identity-email']");
  let settingsEmail = null;
  try {
    await identity.waitFor({ state: 'visible', timeout: 20_000 });
    settingsEmail = (await identity.textContent())?.trim() ?? null;
  } catch {
    // Deployed builds may predate the testid — fall back to body text.
    const body = (await page.textContent('body')) ?? '';
    settingsEmail = body.toLowerCase().includes(email.toLowerCase())
      ? email
      : null;
  }
  await shot(page, '05-settings');
  result.settingsEmail = settingsEmail;
  const emailMatches =
    settingsEmail !== null &&
    settingsEmail.toLowerCase() === email.toLowerCase();
  step('settings-identity', emailMatches, `saw: ${settingsEmail}`);
  if (!emailMatches) finish(1);

  finish(0);
} catch (error) {
  result.error = String(error).slice(0, 1000);
  try {
    await shot(page, '99-failure');
  } catch {
    // page may be gone
  }
  step('fatal', false, result.error);
  finish(1);
} finally {
  await browser.close().catch(() => {});
}
