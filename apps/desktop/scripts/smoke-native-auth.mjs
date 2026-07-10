/**
 * Electron native-auth smoke (Better Auth).
 *
 * Exercises: desktop PKCE start → browser email OTP → /auth/callback deep link
 * → one-time-token exchange → cookie/session restoration → Settings.
 *
 * Requires a running Electron shell with CDP (ELECTRON_CDP_URL) and a web
 * origin with E2E_TEST_MODE=1 so +clerk_test / +e2e emails receive the
 * deterministic OTP 424242.
 */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3112';
const ELECTRON_CDP_URL =
  process.env.ELECTRON_CDP_URL ?? 'http://localhost:9223';
const MACOS_PROTOCOL_OPEN_BUNDLE_ID =
  process.env.JOVIE_PROTOCOL_OPEN_BUNDLE_ID?.trim() || null;
const MAGIC_CODE = '424242';
const SMOKE_CLIENT_IP =
  process.env.SMOKE_CLIENT_IP ??
  `127.77.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
const CLEAR_ELECTRON_AUTH_ON_START =
  process.env.SMOKE_CLEAR_ELECTRON_AUTH === '1';
const SKIP_START_SIGN_OUT = process.env.SMOKE_SKIP_START_SIGNOUT === '1';
const NATIVE_AUTH_CALLBACK_SCHEME = getNativeAuthSchemeForBaseUrl(BASE_URL);
const REQUEST_TIMEOUT_MS = parsePositiveInteger(
  process.env.SMOKE_REQUEST_TIMEOUT_MS,
  180_000
);
const SMOKE_AUTH_EVIDENCE_KEY = 'jovie.desktopAuth.smokeAuthEvidence';
const NATIVE_AUTH_CALLBACK_PREFIX = `${NATIVE_AUTH_CALLBACK_SCHEME}://auth/complete?`;
const SETTINGS_ACCOUNT_PATH = '/app/settings/account';

let playwrightChromium;

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getNativeAuthSchemeForBaseUrl(baseUrl) {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  if (hostname === 'jov.ie') return 'jovie';
  if (hostname === 'staging.jov.ie') return 'jovie-staging';
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  ) {
    return 'jovie-local';
  }
  return 'jovie';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getChromium() {
  if (!playwrightChromium) {
    ({ chromium: playwrightChromium } = await import('playwright'));
  }
  return playwrightChromium;
}

function getStableSmokeEmail() {
  const hostname = new URL(BASE_URL).hostname
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const stamp = Date.now().toString(36);
  // Deterministic OTP gate accepts +clerk_test / +e2e under E2E_TEST_MODE=1.
  return `native-auth-smoke-${hostname || 'local'}-${stamp}+clerk_test@test.jovie.com`;
}

function isBetterAuthSessionCookie(name) {
  return (
    name.startsWith('better-auth.') ||
    name.startsWith('__Secure-better-auth.') ||
    name.startsWith('__Host-better-auth.')
  );
}

async function newAuthContext(browser) {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      'x-forwarded-for': SMOKE_CLIENT_IP,
    },
  });
  const page = await context.newPage();
  return { context, page };
}

async function waitForAppSessionCookie(context, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const cookies = await context.cookies(BASE_URL);
    if (cookies.some(cookie => isBetterAuthSessionCookie(cookie.name))) {
      return;
    }
    await sleep(500);
  }
  throw new Error(`${label} did not persist a Better Auth session cookie`);
}

async function getSessionIdentity(page, label) {
  const identity = await page.evaluate(async () => {
    const response = await fetch('/api/auth/get-session', {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        userId: null,
        sessionId: null,
        email: null,
      };
    }
    const payload = await response.json().catch(() => null);
    const user = payload?.user ?? payload?.data?.user ?? null;
    const session = payload?.session ?? payload?.data?.session ?? null;
    return {
      ok: Boolean(user?.id),
      status: response.status,
      userId: user?.id ?? null,
      sessionId: session?.id ?? null,
      email: user?.email ?? null,
    };
  });

  if (!identity?.ok || !identity.userId) {
    throw new Error(
      `${label} Better Auth session identity unavailable (status=${identity?.status ?? 'n/a'})`
    );
  }
  return identity;
}

/**
 * Drive the Better Auth email OTP form on /signin or /signup.
 * Fills email → send → code step → verify with MAGIC_CODE.
 */
async function signInWithEmailOtp(page, email, redirectUrl = null) {
  const target = redirectUrl
    ? new URL(
        `/signin?redirect_url=${encodeURIComponent(redirectUrl)}`,
        BASE_URL
      ).toString()
    : new URL('/signin', BASE_URL).toString();

  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  const emailInput = page.getByLabel(/email address/i).first();
  await emailInput.waitFor({ state: 'visible', timeout: 60_000 });

  // Hydration-safe: a fill that lands before React hydrates gets reset,
  // leaving the send button disabled forever. Refill and retry.
  await page
    .waitForLoadState('networkidle', { timeout: 45_000 })
    .catch(() => {});
  const sendButton = page.getByRole('button', {
    name: /email me a code|continue with email|sending code/i,
  });
  let codeStepVisible = false;
  for (let attempt = 0; attempt < 3 && !codeStepVisible; attempt++) {
    await emailInput.fill(email);
    await sendButton.click({ timeout: 15_000 }).catch(() => {});
    codeStepVisible = await page
      .locator('[data-auth-email-code-step="code"]')
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!codeStepVisible) {
    throw new Error('email OTP code step never appeared after 3 attempts');
  }

  const otpAutofill = page.getByTestId('otp-autofill-input');
  if (await otpAutofill.count()) {
    await otpAutofill.fill(MAGIC_CODE);
  } else {
    await page.getByLabel(/digit 1 of 6/i).pressSequentially(MAGIC_CODE);
  }

  await page
    .waitForFunction(
      () =>
        !document.querySelector('[data-auth-email-code-step="code"]') ||
        Boolean(
          document.cookie
            .split(';')
            .some(part => /better-auth\.|__Secure-better-auth\./.test(part))
        ),
      undefined,
      { timeout: 90_000 }
    )
    .catch(() => undefined);

  await waitForAppSessionCookie(page.context(), 'email-otp');
  return await getSessionIdentity(page, 'email-otp');
}

async function requestRedirect(page, targetUrl, label) {
  const response = await page.request.get(targetUrl, {
    maxRedirects: 0,
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'x-forwarded-for': SMOKE_CLIENT_IP,
    },
  });
  const location = response.headers().location;
  if (location) {
    return new URL(location, targetUrl).toString();
  }

  const bodySnippet = (await response.text()).slice(0, 160);
  throw new Error(
    `${label} did not return a redirect: status=${response.status()} retry-after=${response.headers()['retry-after'] ?? ''} body=${JSON.stringify(bodySnippet)}`
  );
}

async function completeNativeReturnBounce(page, nativeReturnUrl, label) {
  const parsed = new URL(nativeReturnUrl);
  const callbackPromise = Promise.race([
    waitForNativeProtocolRequest(page, parsed.pathname),
    waitForNativeRedirectResponse(page, parsed.pathname),
  ]);
  await page.goto(nativeReturnUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const nativeCallbackUrl = await callbackPromise;
  if (!nativeCallbackUrl.startsWith(NATIVE_AUTH_CALLBACK_PREFIX)) {
    throw new Error(
      `${label} native-return bounce did not yield the Electron app callback: ${nativeCallbackUrl}`
    );
  }

  return nativeCallbackUrl;
}

async function requestNativeCallbackRedirect(page, callbackPath, label) {
  const redirectUrl = await requestRedirect(page, callbackPath, label);
  if (redirectUrl.startsWith(NATIVE_AUTH_CALLBACK_PREFIX)) {
    return redirectUrl;
  }

  const parsedRedirect = new URL(redirectUrl);
  if (parsedRedirect.pathname !== '/auth/native-return') {
    throw new Error(
      `${label} did not return the Electron app callback or native-return bounce: ${redirectUrl}`
    );
  }

  return await completeNativeReturnBounce(page, redirectUrl, label);
}

function waitForNativeProtocolRequest(page, label, timeout = 60_000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      page.off('request', onRequest);
      reject(new Error(`Timed out waiting for native callback: ${label}`));
    }, timeout);

    function onRequest(request) {
      const requestUrl = request.url();
      if (!requestUrl.startsWith(NATIVE_AUTH_CALLBACK_PREFIX)) return;
      clearTimeout(timeoutId);
      page.off('request', onRequest);
      resolve(requestUrl);
    }

    page.on('request', onRequest);
  });
}

function waitForNativeRedirectResponse(page, label, timeout = 60_000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      page.off('response', onResponse);
      reject(new Error(`Timed out waiting for native redirect: ${label}`));
    }, timeout);

    function onResponse(response) {
      const location = response.headers().location;
      if (!location?.startsWith(NATIVE_AUTH_CALLBACK_PREFIX)) return;
      clearTimeout(timeoutId);
      page.off('response', onResponse);
      resolve(location);
    }

    page.on('response', onResponse);
  });
}

async function completeBrowserAuthState(page, authPageUrl, email) {
  const parsed = new URL(authPageUrl);
  const authState = parsed.searchParams.get('auth_state');
  if (!authState) {
    throw new Error('Browser auth page is missing auth_state');
  }

  const callbackOrigin = parsed.origin;
  const callbackPath = new URL(
    `/auth/callback?state=${encodeURIComponent(authState)}`,
    callbackOrigin
  ).toString();

  // Already signed in → callback should mint OTT + deep link.
  const sessionProbe = await page
    .evaluate(async () => {
      try {
        const response = await fetch('/api/auth/get-session', {
          credentials: 'include',
        });
        if (!response.ok) return null;
        const payload = await response.json();
        return payload?.user?.id ?? payload?.data?.user?.id ?? null;
      } catch {
        return null;
      }
    })
    .catch(() => null);

  if (sessionProbe) {
    return await requestNativeCallbackRedirect(
      page,
      callbackPath,
      'auth callback active-session'
    );
  }

  const callbackPromise = Promise.race([
    waitForNativeProtocolRequest(page, parsed.pathname),
    waitForNativeRedirectResponse(page, parsed.pathname),
  ]);

  await signInWithEmailOtp(page, email, callbackPath).catch(error => {
    if (
      error instanceof Error &&
      /Execution context was destroyed|Target page, context or browser has been closed/i.test(
        error.message
      )
    ) {
      return;
    }
    throw error;
  });

  // Prefer the protocol/redirect race; fall back to explicit callback GET.
  const raced = await Promise.race([
    callbackPromise,
    sleep(2_000).then(() => null),
  ]);
  if (raced) return raced;

  return await requestNativeCallbackRedirect(
    page,
    callbackPath,
    'auth callback after otp'
  );
}

async function requestNativeCallback(page, authUrl, email) {
  const authCallbackUrl = await requestRedirect(page, authUrl, 'auth start');
  const parsedAuthCallback = new URL(authCallbackUrl);
  if (authCallbackUrl.startsWith(NATIVE_AUTH_CALLBACK_PREFIX)) {
    if (parsedAuthCallback.protocol !== `${NATIVE_AUTH_CALLBACK_SCHEME}:`) {
      throw new Error(
        `Auth start did not return the Electron app callback: ${authCallbackUrl}`
      );
    }
    return authCallbackUrl;
  }

  if (
    ['/signin', '/signup', '/sign-in', '/sign-up'].includes(
      parsedAuthCallback.pathname
    )
  ) {
    return await completeBrowserAuthState(page, authCallbackUrl, email);
  }

  if (parsedAuthCallback.pathname !== '/auth/callback') {
    throw new Error(
      `Auth start did not return /auth/callback: ${parsedAuthCallback.pathname}`
    );
  }

  return await requestNativeCallbackRedirect(
    page,
    authCallbackUrl,
    'auth callback'
  );
}

function openNativeCallback(callbackUrl) {
  if (process.platform === 'darwin' && MACOS_PROTOCOL_OPEN_BUNDLE_ID) {
    execFileSync('open', ['-b', MACOS_PROTOCOL_OPEN_BUNDLE_ID, callbackUrl], {
      stdio: 'ignore',
    });
    return;
  }

  execFileSync('open', [callbackUrl], { stdio: 'ignore' });
}

function redactTicketFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    for (const key of ['ticket', 'token', 'code', 'ott']) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return url.toString();
  } catch {
    return '[unparseable-url]';
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`CDP request failed: ${url} ${response.status}`);
  }
  return await response.json();
}

function getCdpHttpUrl(pathname) {
  const base = new URL(ELECTRON_CDP_URL);
  return new URL(pathname, `${base.origin}/`).toString();
}

async function getElectronTargets() {
  return await fetchJson(getCdpHttpUrl('/json/list'));
}

function isBaseUrlTarget(target) {
  if (target.type !== 'page' || typeof target.url !== 'string') return false;
  try {
    return new URL(target.url).origin === new URL(BASE_URL).origin;
  } catch {
    return false;
  }
}

function isDesktopAuthHandoffTarget(target) {
  if (!isBaseUrlTarget(target)) return false;
  try {
    const url = new URL(target.url);
    return url.pathname === '/desktop-auth' && url.searchParams.has('auth_url');
  } catch {
    return false;
  }
}

function isDesktopAuthRouteHandoffTarget(target) {
  if (!isBaseUrlTarget(target)) return false;
  try {
    const url = new URL(target.url);
    const isAuthRoute = ['/signin', '/signup', '/sign-in', '/sign-up'].includes(
      url.pathname
    );
    const redirectUrl = url.searchParams.get('redirect_url') ?? '';
    return (
      isAuthRoute &&
      (url.searchParams.get('runtime') === 'electron' ||
        redirectUrl.includes('runtime=electron'))
    );
  } catch {
    return false;
  }
}

function isAppTarget(target) {
  if (!isBaseUrlTarget(target)) return false;
  try {
    return new URL(target.url).pathname !== '/desktop-auth';
  } catch {
    return false;
  }
}

async function waitForElectronTarget(predicate, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const target = (await getElectronTargets()).find(predicate);
    if (target) return target;
    await sleep(250);
  }

  throw new Error(`Timed out waiting for Electron target: ${label}`);
}

class CdpPage {
  #nextId = 1;
  #pending = new Map();

  constructor(target) {
    this.target = target;
    this.socket = null;
  }

  async connect() {
    if (!this.target.webSocketDebuggerUrl) {
      throw new Error(`CDP target missing websocket URL: ${this.target.id}`);
    }

    this.socket = new WebSocket(this.target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out opening CDP websocket')),
        10_000
      );
      this.socket.addEventListener(
        'open',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );
      this.socket.addEventListener(
        'error',
        () => {
          clearTimeout(timeout);
          reject(new Error('CDP websocket failed to open'));
        },
        { once: true }
      );
    });

    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });

    await this.send('Runtime.enable');
    await this.send('Page.enable');
    return this;
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('CDP websocket is not open');
    }

    const id = this.#nextId;
    this.#nextId += 1;
    const payload = { id, method, params };
    const promise = new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify(payload));
    return promise;
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          'Runtime.evaluate failed'
      );
    }
    return result.result?.value;
  }

  async navigate(url) {
    const navigation = this.send('Runtime.evaluate', {
      expression: `window.location.assign(${JSON.stringify(url)}); true`,
      returnByValue: true,
      userGesture: true,
    });
    const result = await Promise.race([
      navigation.catch(error => {
        if (/Execution context was destroyed/i.test(String(error))) return null;
        throw error;
      }),
      sleep(2000).then(() => null),
    ]);
    if (result?.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'Runtime.evaluate failed';
      if (!/Execution context was destroyed/i.test(description)) {
        throw new Error(description);
      }
    }
  }

  close() {
    this.socket?.close();
  }
}

async function connectCdpPage(target) {
  return await new CdpPage(target).connect();
}

async function waitForDesktopAuthHandoff(page, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const isReady = await page
      .evaluate(`(() => {
        const handoff = document.querySelector(
          '[data-testid="desktop-auth-handoff"], [data-testid="desktop-auth-route-handoff"]'
        );
        if (!handoff) return false;
        const state = handoff.getAttribute('data-desktop-auth-state');
        if (state === 'idle' || state === 'opened' || state === 'error') {
          return true;
        }
        return [...document.querySelectorAll('button')].some(candidate =>
          candidate.textContent?.includes('Continue in Browser') ||
          candidate.textContent?.includes('Cancel Sign-In')
        );
      })()`)
      .catch(() => false);
    if (isReady) return;
    await sleep(250);
  }

  throw new Error(`Desktop auth handoff missing: ${label}`);
}

async function startElectronBrowserAuth() {
  const electronAuthUrl = `${BASE_URL}/signin?redirect_url=${encodeURIComponent('/app/chat?runtime=electron')}`;
  const existingAuthTarget = (await getElectronTargets()).find(
    isDesktopAuthHandoffTarget
  );
  if (existingAuthTarget) {
    const existingAuthPage = await connectCdpPage(existingAuthTarget);
    try {
      await waitForDesktopAuthHandoff(
        existingAuthPage,
        'existing desktop auth handoff'
      );
    } finally {
      existingAuthPage.close();
    }

    const existingHandoffUrl = new URL(existingAuthTarget.url);
    const rawExistingAuthUrl = existingHandoffUrl.searchParams.get('auth_url');
    if (rawExistingAuthUrl) {
      return new URL(rawExistingAuthUrl, BASE_URL).toString();
    }
  }

  const mainTarget =
    (await getElectronTargets()).find(isAppTarget) ??
    (await getElectronTargets()).find(isBaseUrlTarget) ??
    (await getElectronTargets()).find(target => target.type === 'page');
  if (!mainTarget) {
    throw new Error('Electron has no page target');
  }

  const page = await connectCdpPage(mainTarget);
  try {
    await page.navigate(electronAuthUrl);
    await sleep(500);
  } finally {
    page.close();
  }

  const initialAuthTarget = await waitForElectronTarget(
    target =>
      isDesktopAuthHandoffTarget(target) ||
      isDesktopAuthRouteHandoffTarget(target),
    'desktop auth handoff or route fallback'
  );
  let authTarget = initialAuthTarget;

  if (isDesktopAuthRouteHandoffTarget(initialAuthTarget)) {
    const routePage = await connectCdpPage(initialAuthTarget);
    try {
      await waitForDesktopAuthHandoff(routePage, 'auth route fallback');
      const result = await routePage.evaluate(`(async () => {
        return await window.electronAPI.startDesktopAuthHandoff(
          window.location.href
        );
      })()`);
      if (!result?.ok) {
        throw new Error(
          `Desktop auth handoff bridge failed: ${result?.reason ?? 'unknown'}`
        );
      }
    } finally {
      routePage.close();
    }

    authTarget = await waitForElectronTarget(
      isDesktopAuthHandoffTarget,
      'desktop auth handoff'
    );
  }

  const handoffUrl = new URL(authTarget.url);
  const rawAuthUrl = handoffUrl.searchParams.get('auth_url');
  if (!rawAuthUrl) {
    throw new Error('Desktop auth handoff URL is missing auth_url');
  }

  // PKCE contract: central /auth/start must carry code_challenge + method.
  const resolvedAuthUrl = new URL(rawAuthUrl, BASE_URL);
  if (
    resolvedAuthUrl.pathname === '/auth/start' &&
    (!resolvedAuthUrl.searchParams.get('code_challenge') ||
      resolvedAuthUrl.searchParams.get('code_challenge_method') !== 'S256')
  ) {
    throw new Error(
      `Desktop auth start missing PKCE params: ${resolvedAuthUrl.pathname}${resolvedAuthUrl.search}`
    );
  }

  const authPage = await connectCdpPage(authTarget);
  try {
    await waitForDesktopAuthHandoff(authPage, 'desktop auth handoff');
  } finally {
    authPage.close();
  }

  return resolvedAuthUrl.toString();
}

function parseStoredSmokeAuthEvidence(value, expectedUserId, minCapturedAt) {
  if (typeof value !== 'string' || value.length === 0) return null;

  try {
    const parsed = JSON.parse(value);
    if (
      parsed?.apiOk === true &&
      parsed?.userId === expectedUserId &&
      typeof parsed?.capturedAt === 'number' &&
      parsed.capturedAt >= minCapturedAt
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

async function readStoredSmokeAuthEvidence(
  page,
  expectedUserId,
  minCapturedAt
) {
  const rawEvidence = await page.evaluate(`(() => {
    try {
      return window.localStorage.getItem(${JSON.stringify(SMOKE_AUTH_EVIDENCE_KEY)});
    } catch {
      return null;
    }
  })()`);

  return parseStoredSmokeAuthEvidence(
    rawEvidence,
    expectedUserId,
    minCapturedAt
  );
}

async function captureElectronAuthEvidence(page, expectedUserId) {
  return await page.evaluate(`(async () => {
    const sessionResponse = await fetch('/api/auth/get-session', {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    const sessionPayload = sessionResponse.ok
      ? await sessionResponse.json().catch(() => null)
      : null;
    const user = sessionPayload?.user ?? sessionPayload?.data?.user ?? null;
    const session =
      sessionPayload?.session ?? sessionPayload?.data?.session ?? null;
    const userId = user?.id ?? null;
    if (!userId || userId !== ${JSON.stringify(expectedUserId)}) {
      return null;
    }

    const api = await fetch('/api/mobile/v1/me', {
      credentials: 'include',
    });
    const state = {
      url: window.location.href,
      userId,
      sessionId: session?.id ?? null,
      hasSession: Boolean(session?.id || userId),
      hasToken: false,
      apiStatus: api.status,
      apiOk: api.ok,
      capturedAt: Date.now(),
      evidenceSource: 'better-auth-session',
    };

    if (state.apiOk) {
      try {
        window.localStorage.setItem(
          ${JSON.stringify(SMOKE_AUTH_EVIDENCE_KEY)},
          JSON.stringify(state)
        );
      } catch {}
    }

    return state;
  })()`);
}

async function findSignedInElectronPage() {
  const targets = (await getElectronTargets()).filter(isBaseUrlTarget);
  for (const target of targets) {
    const page = await connectCdpPage(target).catch(() => null);
    if (!page) continue;
    try {
      const signedIn = await page.evaluate(`(async () => {
        try {
          const response = await fetch('/api/auth/get-session', {
            credentials: 'include',
          });
          if (!response.ok) return false;
          const payload = await response.json();
          return Boolean(payload?.user?.id ?? payload?.data?.user?.id);
        } catch {
          return false;
        }
      })()`);
      if (signedIn) return page;
      page.close();
    } catch {
      page.close();
    }
  }

  throw new Error('Electron has no signed-in Better Auth page');
}

async function waitForSignedInElectronPage() {
  const deadline = Date.now() + 30_000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return await findSignedInElectronPage();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await sleep(500);
    }
  }

  throw new Error(lastError ?? 'Electron has no signed-in Better Auth page');
}

async function getElectronSessionState() {
  const targets = (await getElectronTargets()).filter(isBaseUrlTarget);
  let fallback = {
    url: BASE_URL,
    userId: null,
    hasSession: false,
  };

  for (const target of targets) {
    const page = await connectCdpPage(target).catch(() => null);
    if (!page) continue;
    try {
      const state = await page.evaluate(`(async () => {
        try {
          const response = await fetch('/api/auth/get-session', {
            credentials: 'include',
          });
          if (!response.ok) {
            return {
              url: window.location.href,
              userId: null,
              hasSession: false,
            };
          }
          const payload = await response.json();
          const userId = payload?.user?.id ?? payload?.data?.user?.id ?? null;
          return {
            url: window.location.href,
            userId,
            hasSession: Boolean(userId),
          };
        } catch {
          return {
            url: window.location.href,
            userId: null,
            hasSession: false,
          };
        }
      })()`);
      fallback = state ?? fallback;
      if (state?.hasSession) return state;
    } catch {
      // Keep scanning other targets; sign-out may be navigating one of them.
    } finally {
      page.close();
    }
  }

  return fallback;
}

function getElectronStorageOrigins() {
  const base = new URL(BASE_URL);
  const origins = new Set([base.origin]);
  const portSuffix = base.port ? `:${base.port}` : '';
  if (base.hostname === 'localhost') {
    origins.add(`http://127.0.0.1${portSuffix}`);
  } else if (base.hostname === '127.0.0.1') {
    origins.add(`http://localhost${portSuffix}`);
  }
  return [...origins];
}

async function waitForElectronSignedOut() {
  const deadline = Date.now() + 60_000;
  let lastState = null;

  while (Date.now() < deadline) {
    lastState = await getElectronSessionState();
    if (!lastState.hasSession) return lastState;
    await sleep(500);
  }

  throw new Error(
    `Electron did not sign out; last user=${lastState?.userId ?? 'unknown'}`
  );
}

async function waitForElectronAuth(expectedUserId, label) {
  const deadline = Date.now() + 120_000;
  const minCapturedAt = Date.now();
  const unwaitlistedTargets = new Set();
  let lastState = null;
  let lastError = null;

  while (Date.now() < deadline) {
    const targets = (await getElectronTargets()).filter(isBaseUrlTarget);
    for (const target of targets) {
      const page = await connectCdpPage(target).catch(() => null);
      if (!page) continue;

      try {
        const storedEvidence = await readStoredSmokeAuthEvidence(
          page,
          expectedUserId,
          minCapturedAt
        );
        if (storedEvidence) {
          return storedEvidence;
        }

        if (!unwaitlistedTargets.has(target.id)) {
          const unwaitlistResult = await page.evaluate(`(async () => {
            const body = document.body?.innerText ?? '';
            if (!/waitlist/i.test(body)) return null;
            const response = await fetch('/api/dev/unwaitlist', {
              method: 'POST',
            });
            return { status: response.status, ok: response.ok };
          })()`);
          if (unwaitlistResult) {
            unwaitlistedTargets.add(target.id);
            if (!unwaitlistResult.ok && unwaitlistResult.status !== 404) {
              throw new Error(
                `Dev unwaitlist failed with ${unwaitlistResult.status}`
              );
            }
            await page.navigate(`${BASE_URL}/app/chat?runtime=electron`);
            continue;
          }
        }

        const state = await captureElectronAuthEvidence(page, expectedUserId);
        if (state) {
          lastState = state;
          if (state.apiOk) {
            return state;
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      } finally {
        page.close();
      }
    }

    await sleep(250);
  }

  throw new Error(
    `${label} API call failed with ${
      lastState?.apiStatus ?? lastError ?? 'unknown'
    }`
  );
}

async function openSettingsAndAssert(page, expectedEmail) {
  await page.navigate(`${BASE_URL}${SETTINGS_ACCOUNT_PATH}`);
  const settings = await page.evaluate(`(async () => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const section = document.querySelector(
        '[data-testid="account-settings-section"]'
      );
      const emailEl = document.querySelector(
        '[data-testid="account-identity-email"]'
      );
      if (section && emailEl) {
        return {
          ok: true,
          email: emailEl.textContent?.trim() ?? null,
          hasUnavailable: /account settings unavailable/i.test(
            document.body?.innerText ?? ''
          ),
        };
      }
      await new Promise(r => setTimeout(r, 250));
    }
    return {
      ok: false,
      email: null,
      hasUnavailable: /account settings unavailable/i.test(
        document.body?.innerText ?? ''
      ),
    };
  })()`);

  if (!settings?.ok) {
    throw new Error('Settings account section did not render');
  }
  if (settings.hasUnavailable) {
    throw new Error('Settings still shows unavailable gate');
  }
  if (
    expectedEmail &&
    settings.email &&
    settings.email.toLowerCase() !== expectedEmail.toLowerCase()
  ) {
    throw new Error(
      `Settings email mismatch: got ${settings.email}, expected ${expectedEmail}`
    );
  }
  return settings;
}

async function signOutElectron() {
  const page = await waitForSignedInElectronPage();

  try {
    await page.evaluate(`(async () => {
      const redirectUrl = '/signin?redirect_url=%2Fapp%2Fchat%3Fruntime%3Delectron';
      try {
        await fetch('/api/auth/sign-out', {
          method: 'POST',
          credentials: 'include',
        });
      } catch {}
      try {
        await fetch('/api/auth/reset', {
          method: 'POST',
          credentials: 'include',
        });
      } catch {}
      window.location.assign(redirectUrl);
      return true;
    })()`);
  } finally {
    page.close();
  }

  return await waitForElectronSignedOut();
}

async function signOutOrClearElectronAuth() {
  try {
    return await signOutElectron();
  } catch (error) {
    if (!CLEAR_ELECTRON_AUTH_ON_START) {
      throw error;
    }

    await clearElectronAuthStorage();
    return await waitForElectronSignedOut();
  }
}

async function clearElectronAuthStorage() {
  const targets = (await getElectronTargets()).filter(
    target => target.type === 'page'
  );
  const origins = getElectronStorageOrigins();
  for (const target of targets) {
    const page = await connectCdpPage(target).catch(() => null);
    if (!page) continue;
    try {
      await page.send('Network.enable').catch(() => undefined);
      await page.send('Network.clearBrowserCookies').catch(() => undefined);
      await page.send('Network.clearBrowserCache').catch(() => undefined);
      for (const origin of origins) {
        await page
          .send('Storage.clearDataForOrigin', {
            origin,
            storageTypes: 'all',
          })
          .catch(() => undefined);
      }
      await page.evaluate(`(() => {
        try {
          localStorage.clear();
        } catch {}
        try {
          sessionStorage.clear();
        } catch {}
        try {
          for (const cookie of document.cookie.split(';')) {
            const name = cookie.split('=')[0]?.trim();
            if (name) {
              document.cookie = name + '=; Max-Age=0; path=/';
            }
          }
        } catch {}
        return true;
      })()`);
    } finally {
      page.close();
    }
  }
}

async function main() {
  // Better Auth smoke does not need Clerk keys. Keep a no-op Buffer import
  // path-free reference for environments that polyfill global crypto only.
  void Buffer;

  const chromium = await getChromium();
  const browser = await chromium.launch({ headless: true });
  const email = getStableSmokeEmail();

  try {
    if (!SKIP_START_SIGN_OUT) {
      await signOutElectron().catch(() => undefined);
      if (CLEAR_ELECTRON_AUTH_ON_START) {
        await clearElectronAuthStorage();
      }
    }

    // Pass 1: signup (auto-create via email OTP) → deep link → Settings
    const fresh = await newAuthContext(browser);
    const provisionedSignin = await signInWithEmailOtp(fresh.page, email);
    await waitForAppSessionCookie(fresh.context, 'fresh-signup');
    const freshAuthUrl = await startElectronBrowserAuth();
    const freshCallback = await requestNativeCallback(
      fresh.page,
      freshAuthUrl,
      email
    );
    openNativeCallback(freshCallback);
    const freshElectron = await waitForElectronAuth(
      provisionedSignin.userId,
      'fresh-signup'
    );
    const settingsPage = await waitForSignedInElectronPage();
    let settings;
    try {
      settings = await openSettingsAndAssert(settingsPage, email);
    } finally {
      settingsPage.close();
    }
    await fresh.context.close();

    const signedOut = await signOutOrClearElectronAuth();
    if (CLEAR_ELECTRON_AUTH_ON_START) {
      await clearElectronAuthStorage();
    }

    // Pass 2: same-account login → deep link → Settings reload
    const existing = await newAuthContext(browser);
    const existingSignin = await signInWithEmailOtp(existing.page, email);
    await waitForAppSessionCookie(existing.context, 'existing-signin');
    const existingAuthUrl = await startElectronBrowserAuth();
    const existingCallback = await requestNativeCallback(
      existing.page,
      existingAuthUrl,
      email
    );
    openNativeCallback(existingCallback);
    const existingElectron = await waitForElectronAuth(
      existingSignin.userId,
      'existing-signin'
    );
    const settingsPage2 = await waitForSignedInElectronPage();
    let settingsReload;
    try {
      settingsReload = await openSettingsAndAssert(settingsPage2, email);
    } finally {
      settingsPage2.close();
    }
    await existing.context.close();

    console.log(
      JSON.stringify(
        {
          email,
          scheme: NATIVE_AUTH_CALLBACK_SCHEME,
          provisionedSignin: {
            userId: provisionedSignin.userId,
            electronUrl: redactTicketFromUrl(freshElectron.url),
            apiStatus: freshElectron.apiStatus,
            evidenceSource: freshElectron.evidenceSource,
            settingsEmail: settings?.email ?? null,
          },
          signedOut,
          existingSignin: {
            userId: existingSignin.userId,
            electronUrl: redactTicketFromUrl(existingElectron.url),
            apiStatus: existingElectron.apiStatus,
            evidenceSource: existingElectron.evidenceSource,
            settingsEmail: settingsReload?.email ?? null,
          },
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  const cause =
    error instanceof Error && error.cause
      ? `\nCause: ${
          error.cause instanceof Error
            ? (error.cause.stack ?? error.cause.message)
            : String(error.cause)
        }`
      : '';
  console.error(
    `${
      error instanceof Error ? (error.stack ?? error.message) : String(error)
    }${cause}`
  );
  process.exit(1);
});
