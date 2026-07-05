import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3112';
const ELECTRON_CDP_URL =
  process.env.ELECTRON_CDP_URL ?? 'http://localhost:9223';
const MACOS_PROTOCOL_OPEN_BUNDLE_ID =
  process.env.JOVIE_PROTOCOL_OPEN_BUNDLE_ID?.trim() || null;
const MAGIC_CODE = '424242';
const TESTING_TOKEN_PARAM = '__clerk_testing_token';
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

function parseFrontendApi(pk) {
  const match = pk.match(/^pk_(test|live)_(.+)$/);
  if (!match) throw new Error('Invalid Clerk publishable key format');
  return Buffer.from(match[2], 'base64').toString('utf8').replace(/\$$/, '');
}

async function getTestingToken(secretKey) {
  const errors = [];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await requestTestingToken(secretKey);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (attempt < 4) {
        await sleep(1000 * attempt);
      }
    }
  }

  throw new Error(
    `Testing token request failed after retries: ${errors.join(' | ')}`
  );
}

async function requestTestingToken(secretKey) {
  let data;
  try {
    const response = await fetch('https://api.clerk.com/v1/testing_tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Testing token request failed: ${response.status}`);
    }
    data = await response.json();
  } catch {
    const output = execFileSync(
      'curl',
      [
        '-fsS',
        '--connect-timeout',
        '10',
        '--max-time',
        '30',
        '-X',
        'POST',
        '-K',
        '-',
        'https://api.clerk.com/v1/testing_tokens',
      ],
      {
        encoding: 'utf8',
        input: `header = "Authorization: Bearer ${secretKey}"\n`,
      }
    );
    data = JSON.parse(output);
  }
  if (!data.token) throw new Error('Testing token response missing token');
  return data.token;
}

async function clerkBackendRequest(
  secretKey,
  path,
  { method = 'GET', body } = {}
) {
  const response = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    throw new Error(
      `Clerk Backend API request failed: ${method} ${path} ${response.status} ${responseBody}`
    );
  }

  return await response.json();
}

function firstUserFromList(response) {
  const users = Array.isArray(response) ? response : response?.data;
  return Array.isArray(users) ? users[0] : null;
}

function getStableSmokeEmail() {
  const hostname = new URL(BASE_URL).hostname
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `native-auth-smoke-${hostname || 'local'}+clerk_test@test.jovie.com`;
}

async function ensureSmokeUser(secretKey, email) {
  const searchPath = `/users?email_address=${encodeURIComponent(email)}&limit=1`;
  const existing = firstUserFromList(
    await clerkBackendRequest(secretKey, searchPath)
  );
  if (existing?.id) {
    return { userId: existing.id, reused: true };
  }

  const metadata = {
    role: 'native_auth_smoke',
    app: 'desktop',
  };
  let created;
  try {
    created = await clerkBackendRequest(secretKey, '/users', {
      method: 'POST',
      body: {
        email_address: [email],
        first_name: 'Native',
        last_name: 'Auth QA',
        public_metadata: metadata,
        skip_password_requirement: true,
      },
    });
  } catch (error) {
    const raced = firstUserFromList(
      await clerkBackendRequest(secretKey, searchPath).catch(() => null)
    );
    if (raced?.id) {
      return { userId: raced.id, reused: true };
    }
    throw error;
  }
  if (!created?.id) {
    const raced = firstUserFromList(
      await clerkBackendRequest(secretKey, searchPath)
    );
    if (raced?.id) {
      return { userId: raced.id, reused: true };
    }
    throw new Error('Clerk user create response missing id');
  }

  return { userId: created.id, reused: false };
}

async function createSignInTicket(secretKey, userId) {
  const token = await clerkBackendRequest(secretKey, '/sign_in_tokens', {
    method: 'POST',
    body: {
      user_id: userId,
      expires_in_seconds: 300,
    },
  });
  if (!token?.token) {
    throw new Error('Clerk sign-in token response missing token');
  }
  return token.token;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function setupClerkTestingToken(context, fapiHost, testingToken) {
  async function appendTestingToken(route) {
    const url = new URL(route.request().url());
    url.searchParams.set(TESTING_TOKEN_PARAM, testingToken);

    try {
      const response = await route.fetch({ url: url.toString() });
      const json = await response.json();
      if (json?.response?.captcha_bypass === false) {
        json.response.captcha_bypass = true;
      }
      if (json?.client?.captcha_bypass === false) {
        json.client.captcha_bypass = true;
      }
      await route.fulfill({ response, json });
    } catch {
      await route.continue({ url: url.toString() });
    }
  }

  const fapiPattern = new RegExp(
    `^https://${escapeRegExp(fapiHost)}/v1/.*?(\\?.*)?$`
  );
  const baseOrigin = new URL(BASE_URL).origin;
  const proxyPattern = new RegExp(
    `^${escapeRegExp(baseOrigin)}/__clerk/v1/.*?(\\?.*)?$`
  );

  await context.route(fapiPattern, appendTestingToken);
  await context.route(proxyPattern, appendTestingToken);
}

async function newAuthContext(browser, fapiHost, testingToken) {
  const context = await browser.newContext();
  if (testingToken) {
    await setupClerkTestingToken(context, fapiHost, testingToken);
  }
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/signin`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded), undefined, {
    timeout: 90_000,
  });
  return { context, page };
}

async function signUpFresh(page, email, redirectUrl = null) {
  try {
    return await page.evaluate(
      async ({ email: targetEmail, code, redirectUrl: targetRedirectUrl }) => {
        async function waitForActiveIdentity(
          fallbackSessionId,
          fallbackUserId
        ) {
          for (let attempt = 0; attempt < 30; attempt += 1) {
            if (clerk.user?.id || clerk.session?.id) {
              return {
                userId: clerk.user?.id ?? fallbackUserId ?? null,
                sessionId: clerk.session?.id ?? fallbackSessionId ?? null,
              };
            }
            await new Promise(resolve => setTimeout(resolve, 250));
          }

          return {
            userId: clerk.user?.id ?? fallbackUserId ?? null,
            sessionId: clerk.session?.id ?? fallbackSessionId ?? null,
          };
        }

        const clerk = window.Clerk;
        if (!clerk?.client?.signUp) {
          throw new Error('Clerk signUp API unavailable');
        }

        const signUp = await clerk.client.signUp.create({
          emailAddress: targetEmail,
        });
        await signUp.prepareEmailAddressVerification({
          strategy: 'email_code',
        });
        const result = await signUp.attemptEmailAddressVerification({ code });

        if (result.status !== 'complete' || !result.createdSessionId) {
          throw new Error(
            `Fresh signup did not create a complete session: ${result.status}`
          );
        }

        const activate = clerk.setActive({
          session: result.createdSessionId,
          ...(targetRedirectUrl ? { redirectUrl: targetRedirectUrl } : {}),
        });
        await Promise.race([
          activate.catch(() => undefined),
          new Promise(resolve => setTimeout(resolve, 5000)),
        ]);

        const identity = await waitForActiveIdentity(
          result.createdSessionId,
          result.createdUserId
        );
        if (!identity.userId) {
          throw new Error('Fresh signup did not expose Clerk user id');
        }

        return identity;
      },
      { email, code: MAGIC_CODE, redirectUrl }
    );
  } catch (error) {
    if (!isNavigationInterruption(error)) throw error;
    return await getClerkPageIdentity(page, 'fresh-signup').catch(async () => {
      await waitForAppSessionCookie(page.context(), 'fresh-signup');
      return getClerkSessionIdentity(page.context(), 'fresh-signup');
    });
  }
}

async function signInExisting(page, email, redirectUrl = null) {
  try {
    return await page.evaluate(
      async ({ email: targetEmail, code, redirectUrl: targetRedirectUrl }) => {
        async function waitForActiveIdentity(fallbackSessionId) {
          for (let attempt = 0; attempt < 30; attempt += 1) {
            if (clerk.user?.id || clerk.session?.id) {
              return {
                userId: clerk.user?.id ?? null,
                sessionId: clerk.session?.id ?? fallbackSessionId ?? null,
              };
            }
            await new Promise(resolve => setTimeout(resolve, 250));
          }

          return {
            userId: clerk.user?.id ?? null,
            sessionId: clerk.session?.id ?? fallbackSessionId ?? null,
          };
        }

        const clerk = window.Clerk;
        if (!clerk?.client?.signIn) {
          throw new Error('Clerk signIn API unavailable');
        }

        const signIn = await clerk.client.signIn.create({
          identifier: targetEmail,
        });
        const emailFactor = signIn.supportedFirstFactors?.find(
          factor =>
            factor.strategy === 'email_code' &&
            typeof factor.emailAddressId === 'string'
        );
        if (!emailFactor?.emailAddressId) {
          throw new Error('email_code factor unavailable');
        }

        await signIn.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId,
        });
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code,
        });

        if (result.status !== 'complete' || !result.createdSessionId) {
          throw new Error(
            `Existing sign-in did not create a complete session: ${result.status}`
          );
        }

        const activate = clerk.setActive({
          session: result.createdSessionId,
          ...(targetRedirectUrl ? { redirectUrl: targetRedirectUrl } : {}),
        });
        await Promise.race([
          activate.catch(() => undefined),
          new Promise(resolve => setTimeout(resolve, 5000)),
        ]);

        const identity = await waitForActiveIdentity(result.createdSessionId);
        if (!identity.userId) {
          throw new Error('Existing sign-in did not expose Clerk user id');
        }

        return identity;
      },
      { email, code: MAGIC_CODE, redirectUrl }
    );
  } catch (error) {
    if (!isNavigationInterruption(error)) throw error;
    return await getClerkPageIdentity(page, 'existing-signin').catch(
      async () => {
        await waitForAppSessionCookie(page.context(), 'existing-signin');
        return getClerkSessionIdentity(page.context(), 'existing-signin');
      }
    );
  }
}

async function signInWithTicket(
  page,
  ticket,
  expectedUserId,
  redirectUrl = null
) {
  try {
    return await page.evaluate(
      async ({
        signInTicket,
        expectedUserId: targetUserId,
        redirectUrl: targetRedirectUrl,
      }) => {
        function describeError(error) {
          try {
            return JSON.stringify({
              message: error?.message,
              status: error?.status,
              clerkError: error?.clerkError,
              errors: error?.errors,
              longMessage: error?.longMessage,
            });
          } catch {
            return String(error);
          }
        }

        async function waitForActiveIdentity(fallbackSessionId) {
          for (let attempt = 0; attempt < 30; attempt += 1) {
            if (clerk.user?.id || clerk.session?.id) {
              return {
                userId: clerk.user?.id ?? clerk.session?.user?.id ?? null,
                sessionId: clerk.session?.id ?? fallbackSessionId ?? null,
              };
            }
            await new Promise(resolve => setTimeout(resolve, 250));
          }

          return {
            userId: clerk.user?.id ?? clerk.session?.user?.id ?? null,
            sessionId: clerk.session?.id ?? fallbackSessionId ?? null,
          };
        }

        const clerk = window.Clerk;
        const signIn = clerk?.client?.signIn;
        const futureSignIn = signIn?.__internal_future;
        if (
          !clerk?.setActive ||
          (!signIn?.ticket && !futureSignIn?.ticket && !signIn?.create)
        ) {
          throw new Error('Clerk ticket API unavailable');
        }

        let ticketAttempt;
        let finalizeAttempt = null;
        if (signIn?.create) {
          ticketAttempt = await signIn
            .create({ strategy: 'ticket', ticket: signInTicket })
            .catch(error => {
              throw new Error(
                `Clerk ticket sign-in threw: ${describeError(error)}`
              );
            });
        } else if (signIn?.ticket && signIn?.finalize) {
          ticketAttempt = await signIn
            .ticket({ ticket: signInTicket })
            .catch(error => {
              throw new Error(
                `Clerk ticket sign-in threw: ${describeError(error)}`
              );
            });
          if (ticketAttempt.error) {
            throw new Error(
              `Clerk ticket sign-in failed: ${describeError(ticketAttempt.error)}`
            );
          }
          finalizeAttempt = await signIn.finalize().catch(error => {
            throw new Error(
              `Clerk ticket finalize threw: ${describeError(error)}`
            );
          });
        } else {
          ticketAttempt = await futureSignIn
            .ticket({ ticket: signInTicket })
            .catch(error => {
              throw new Error(
                `Clerk future ticket sign-in threw: ${describeError(error)}`
              );
            });
        }

        if (ticketAttempt.error) {
          throw new Error(
            `Clerk ticket sign-in failed: ${describeError(ticketAttempt.error)}`
          );
        }
        let sessionId =
          ticketAttempt.createdSessionId ||
          signIn.createdSessionId ||
          futureSignIn?.createdSessionId;
        finalizeAttempt =
          !sessionId && futureSignIn?.finalize
            ? await futureSignIn.finalize().catch(error => {
                throw new Error(
                  `Clerk future ticket finalize threw: ${describeError(error)}`
                );
              })
            : finalizeAttempt;
        if (finalizeAttempt?.error) {
          throw new Error('Clerk ticket finalize failed');
        }
        sessionId = sessionId || finalizeAttempt?.createdSessionId;
        if (!sessionId) {
          throw new Error('Clerk ticket did not create a session');
        }

        await clerk.setActive({
          session: sessionId,
          ...(targetRedirectUrl ? { redirectUrl: targetRedirectUrl } : {}),
        });
        const identity = await waitForActiveIdentity(sessionId);
        if (identity.userId !== targetUserId) {
          throw new Error(
            `Activated user mismatch: expected ${targetUserId}, got ${
              identity.userId || 'null'
            }`
          );
        }
        return identity;
      },
      { signInTicket: ticket, expectedUserId, redirectUrl }
    );
  } catch (error) {
    if (!isNavigationInterruption(error)) throw error;
    return await getClerkPageIdentity(page, 'ticket-signin').catch(async () => {
      await waitForAppSessionCookie(page.context(), 'ticket-signin');
      return getClerkSessionIdentity(page.context(), 'ticket-signin');
    });
  }
}

async function signInWithFreshTicket(
  page,
  secretKey,
  expectedUserId,
  redirectUrl = null
) {
  const errors = [];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const ticket = await createSignInTicket(secretKey, expectedUserId);
      return await signInWithTicket(page, ticket, expectedUserId, redirectUrl);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      if (attempt < 4) {
        await sleep(1000 * attempt);
      }
    }
  }

  throw new Error(
    `Clerk ticket sign-in failed after retries: ${errors.join(' | ')}`
  );
}

function isNavigationInterruption(error) {
  return (
    error instanceof Error &&
    /Execution context was destroyed|Target page, context or browser has been closed|Inspected target navigated or closed/i.test(
      error.message
    )
  );
}

function decodeJwtPayload(token) {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function getClerkSessionIdentity(context, label) {
  const cookies = await context.cookies(BASE_URL);
  const sessionCookie = cookies.find(cookie =>
    cookie.name.startsWith('__session')
  );
  const payload = sessionCookie ? decodeJwtPayload(sessionCookie.value) : null;
  if (!payload || typeof payload.sub !== 'string') {
    throw new Error(`${label} session cookie is missing Clerk user id`);
  }

  return {
    userId: payload.sub,
    sessionId: typeof payload.sid === 'string' ? payload.sid : null,
  };
}

async function getClerkPageIdentity(page, label) {
  await page.waitForFunction(
    () => Boolean(window.Clerk?.loaded && window.Clerk?.user?.id),
    undefined,
    { timeout: 30_000 }
  );

  const identity = await page.evaluate(() => ({
    userId: window.Clerk?.user?.id ?? null,
    sessionId: window.Clerk?.session?.id ?? null,
  }));

  if (!identity.userId) {
    throw new Error(`${label} Clerk user id is unavailable`);
  }

  return identity;
}

async function waitForAppSessionCookie(context, label) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const cookies = await context.cookies(BASE_URL);
    if (cookies.some(cookie => cookie.name.startsWith('__session'))) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`${label} did not persist a Clerk app session cookie`);
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
  await page.goto(authPageUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded), undefined, {
    timeout: 90_000,
  });

  const activeSessionId = await page.evaluate(
    () => window.Clerk?.session?.id ?? null
  );
  if (activeSessionId) {
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
  const authAction =
    parsed.pathname === '/signup' || parsed.pathname === '/sign-up'
      ? signUpFresh(page, email, callbackPath)
      : signInExisting(page, email, callbackPath);
  await authAction.catch(error => {
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

  return await callbackPromise;
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
    if (url.searchParams.has('ticket')) {
      url.searchParams.set('ticket', '[redacted]');
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
    await new Promise(resolve => setTimeout(resolve, 250));
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
        if (isNavigationInterruption(error)) return null;
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
    await new Promise(resolve => setTimeout(resolve, 250));
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

  const authPage = await connectCdpPage(authTarget);
  try {
    await waitForDesktopAuthHandoff(authPage, 'desktop auth handoff');
  } finally {
    authPage.close();
  }

  return new URL(rawAuthUrl, BASE_URL).toString();
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
    if (
      !window.Clerk?.loaded ||
      window.Clerk?.user?.id !== ${JSON.stringify(expectedUserId)} ||
      !window.Clerk?.session
    ) {
      return null;
    }

    const token = await window.Clerk.session.getToken();
    const api = await fetch('/api/mobile/v1/me', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const state = {
      url: window.location.href,
      userId: window.Clerk.user.id,
      hasSession: Boolean(window.Clerk.session),
      hasToken: Boolean(token),
      apiStatus: api.status,
      apiOk: api.ok,
      capturedAt: Date.now(),
      evidenceSource: 'clerk-token',
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
      const signedIn = await page.evaluate(`(() => {
        return Boolean(window.Clerk?.loaded && window.Clerk?.session);
      })()`);
      if (signedIn) return page;
      page.close();
    } catch {
      page.close();
    }
  }

  throw new Error('Electron has no signed-in Clerk page');
}

async function waitForSignedInElectronPage() {
  const deadline = Date.now() + 30_000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return await findSignedInElectronPage();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error(lastError ?? 'Electron has no signed-in Clerk page');
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
      const state = await page.evaluate(`(() => {
        return {
          url: window.location.href,
          userId: window.Clerk?.user?.id ?? null,
          hasSession: Boolean(window.Clerk?.session),
        };
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
    await new Promise(resolve => setTimeout(resolve, 500));
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

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(
    `${label} API call failed with ${
      lastState?.apiStatus ?? lastError ?? 'unknown'
    }`
  );
}

async function signOutElectron() {
  const page = await waitForSignedInElectronPage();

  try {
    await page.evaluate(`(async () => {
      const redirectUrl = '/signin?redirect_url=%2Fapp%2Fchat%3Fruntime%3Delectron';
      await window.Clerk?.signOut?.({ redirectUrl })?.catch?.(() => undefined);
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
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) {
    throw new Error(
      'Missing Clerk dev env. Run with Doppler dev Clerk keys loaded.'
    );
  }

  const fapiHost = parseFrontendApi(publishableKey);
  const testingToken = await getTestingToken(secretKey);
  const chromium = await getChromium();
  const browser = await chromium.launch({ headless: true });
  const email = getStableSmokeEmail();
  const provisionedUser = await ensureSmokeUser(secretKey, email);

  try {
    if (!SKIP_START_SIGN_OUT) {
      await signOutElectron().catch(() => undefined);
      if (CLEAR_ELECTRON_AUTH_ON_START) {
        await clearElectronAuthStorage();
      }
    }

    const fresh = await newAuthContext(browser, fapiHost, null);
    const provisionedSignin = await signInWithFreshTicket(
      fresh.page,
      secretKey,
      provisionedUser.userId
    );
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
    await fresh.context.close();

    const signedOut = await signOutOrClearElectronAuth();
    if (CLEAR_ELECTRON_AUTH_ON_START) {
      await clearElectronAuthStorage();
    }

    const existing = await newAuthContext(browser, fapiHost, testingToken);
    const existingSignin = await signInWithFreshTicket(
      existing.page,
      secretKey,
      provisionedUser.userId
    );
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
    await existing.context.close();

    console.log(
      JSON.stringify(
        {
          email,
          provisionedSignin: {
            userId: provisionedSignin.userId,
            reused: provisionedUser.reused,
            electronUrl: redactTicketFromUrl(freshElectron.url),
            apiStatus: freshElectron.apiStatus,
          },
          signedOut,
          existingSignin: {
            userId: existingSignin.userId,
            electronUrl: redactTicketFromUrl(existingElectron.url),
            apiStatus: existingElectron.apiStatus,
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
