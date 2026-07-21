'use strict';

const {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');

const BYPASS_HEADER = 'x-vercel-protection-bypass';
const SET_BYPASS_COOKIE_HEADER = 'x-vercel-set-bypass-cookie';
const BUILD_INFO_PATH = '/api/health/build-info';
const DEFAULT_PROBE_TIMEOUT_MS = 120_000;
const DEFAULT_VERCEL_API_PAGES = 5;
const DEFAULT_VERCEL_DEPLOYMENT_POLL_INTERVAL_MS = 5_000;
const VERCEL_DEPLOYMENT_HOST = /^(?:[a-z0-9-]+\.)+vercel\.app$/i;
// Vercel deployment hostnames are <project>-<deployment>-<team>.vercel.app.
// Both the project and team slug are fixed here so a corrupted URL cannot send
// the project bypass credential to another Vercel tenant.
const JOVIE_DEPLOYMENT_HOST =
  /^jovie-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-jovie\.vercel\.app$/i;
const TRUSTED_PROTECTED_ALIAS_HOSTS = new Set(['staging.jov.ie']);
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
const BUILD_COMMIT_SHA = /^[0-9a-f]{7,40}$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]+$/;
const TRUSTED_ENVIRONMENTS = new Set(['preview', 'production']);
const TRANSIENT_DEPLOYMENT_STATES = new Set([
  'BUILDING',
  'INITIALIZING',
  'PENDING',
  'QUEUED',
]);
const TRANSIENT_VERCEL_API_STATUSES = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);
const PUBLIC_ERROR_CONTENT =
  /application error|internal server error|something went wrong|error occurred|this page could not be found|page could not be found|profile not found|temporarily unavailable|auth unavailable|turnstile is not configured/i;
// Next.js serializes error/not-found boundary templates into the RSC flight
// payload (<script>self.__next_f.push(...)</script>) of every healthy page, so
// error phrases like "Profile not found" legitimately appear inside inline
// scripts without ever rendering. Strip script blocks before the error-content
// scan; a genuinely rendered error page carries the phrase in visible markup.
const INLINE_SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;

function stripInlineScripts(html) {
  return html.replace(INLINE_SCRIPT_BLOCK, '');
}
const PUBLIC_HTML_SURFACES = Object.freeze([
  { label: 'Homepage', path: '/', minimumBytes: 1_000 },
  {
    label: 'Public profile',
    path: '/tim',
    minimumBytes: 500,
    requiredContent: 'data-testid="public-profile-layout-shell"',
  },
  { label: 'Signup', path: '/signup', minimumBytes: 500 },
  { label: 'Signin', path: '/signin', minimumBytes: 500 },
  { label: 'Start', path: '/start', minimumBytes: 500 },
  { label: 'Pricing', path: '/pricing', minimumBytes: 500 },
]);

function projectSemanticHtml(body) {
  // App Router serializes alternate error/not-found boundaries into hydration
  // scripts even when the rendered route is healthy. Only inspect content the
  // document can present; malformed or unclosed inert blocks remain fail-closed.
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

function parseProbeUrl(rawUrl, label = 'Probe URL') {
  let url;
  try {
    url = rawUrl instanceof URL ? new URL(rawUrl.href) : new URL(rawUrl);
  } catch {
    throw new Error(`${label} is malformed.`);
  }

  if (url.username || url.password || url.hash) {
    throw new Error(`${label} must not contain credentials or a fragment.`);
  }

  return url;
}

function isExactVercelDeploymentUrl(rawUrl) {
  const url = parseProbeUrl(rawUrl);
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    JOVIE_DEPLOYMENT_HOST.test(url.hostname)
  );
}

function isTrustedVercelProtectedAliasUrl(rawUrl) {
  const url = parseProbeUrl(rawUrl);
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    TRUSTED_PROTECTED_ALIAS_HOSTS.has(url.hostname.toLowerCase())
  );
}

function requireExpectedProtectedAliasOrigin(rawExpectedOrigin, targetUrl) {
  if (!rawExpectedOrigin) {
    throw new Error(
      'EXPECTED_VERCEL_ALIAS_ORIGIN is required before attaching the protected-origin credential to an alias.'
    );
  }
  const expected = parseProbeUrl(
    rawExpectedOrigin,
    'Expected Vercel protected alias origin'
  );
  if (
    !isTrustedVercelProtectedAliasUrl(expected) ||
    expected.pathname !== '/' ||
    expected.search
  ) {
    throw new Error(
      'Expected Vercel protected alias origin must identify one trusted Jovie alias.'
    );
  }
  if (targetUrl.origin !== expected.origin) {
    throw new Error(
      'Protected-origin credential target does not match the authorized alias origin.'
    );
  }
}

function assertTrustedVercelTarget(url, label = 'Probe URL') {
  if (
    url.protocol === 'https:' &&
    url.port === '' &&
    VERCEL_DEPLOYMENT_HOST.test(url.hostname) &&
    !isExactVercelDeploymentUrl(url)
  ) {
    throw new Error(`${label} is not a trusted Jovie deployment host.`);
  }
}

function requireExpectedDeploymentOrigin(rawExpectedOrigin, targetUrl) {
  if (!rawExpectedOrigin) {
    throw new Error(
      'EXPECTED_VERCEL_DEPLOYMENT_ORIGIN is required before attaching the protected-origin credential.'
    );
  }
  const expected = parseProbeUrl(
    rawExpectedOrigin,
    'Expected Vercel deployment origin'
  );
  if (
    !isExactVercelDeploymentUrl(expected) ||
    expected.pathname !== '/' ||
    expected.search
  ) {
    throw new Error(
      'Expected Vercel deployment origin must identify one trusted Jovie deployment origin.'
    );
  }
  if (targetUrl.origin !== expected.origin) {
    throw new Error(
      'Protected-origin credential target does not match the authorized deployment origin.'
    );
  }
}

function assertAuthorizedDeploymentOrigin(rawCandidate, rawResolvedOrigin) {
  const candidate = parseProbeUrl(rawCandidate, 'Deployment URL');
  if (
    !isExactVercelDeploymentUrl(candidate) ||
    candidate.pathname !== '/' ||
    candidate.search
  ) {
    throw new Error(
      'Deployment URL must identify one trusted Jovie deployment origin.'
    );
  }
  requireExpectedDeploymentOrigin(rawResolvedOrigin, candidate);
  return candidate.origin;
}

function requireExpectedEnvironment(rawEnvironment) {
  const environment = rawEnvironment?.trim().toLowerCase();
  if (!TRUSTED_ENVIRONMENTS.has(environment)) {
    throw new Error(
      'EXPECTED_VERCEL_ENVIRONMENT must be explicitly set to preview or production.'
    );
  }
  return environment;
}

function requireFullCommitSha(rawSha, label = 'EXPECTED_COMMIT_SHA') {
  const sha = rawSha?.trim().toLowerCase();
  if (!FULL_COMMIT_SHA.test(sha ?? '')) {
    throw new Error(`${label} must be a full commit SHA.`);
  }
  return sha;
}

function safeRouteLabel(rawUrl) {
  const url = parseProbeUrl(rawUrl);
  return `${url.origin}${url.pathname}`;
}

function buildOriginBoundProbeRequest(
  rawUrl,
  {
    bypassSecret,
    expectedDeploymentOrigin,
    setBypassCookie = false,
    headers = {},
  } = {}
) {
  const url = parseProbeUrl(rawUrl);
  assertTrustedVercelTarget(url);
  const requestHeaders = { ...headers };

  if (isExactVercelDeploymentUrl(url)) {
    requireExpectedDeploymentOrigin(expectedDeploymentOrigin, url);
    const secret = bypassSecret?.trim();
    if (!secret) {
      throw new Error(
        'VERCEL_AUTOMATION_BYPASS_SECRET is required for an exact protected Vercel deployment probe.'
      );
    }
    requestHeaders[BYPASS_HEADER] = secret;
    if (setBypassCookie) {
      requestHeaders[SET_BYPASS_COOKIE_HEADER] = 'true';
    }
  }

  return {
    url,
    options: {
      headers: requestHeaders,
      redirect: 'manual',
    },
  };
}

function buildOriginBoundCookieRequest(
  rawUrl,
  { cookieHeader, headers = {} } = {}
) {
  const url = parseProbeUrl(rawUrl);
  assertTrustedVercelTarget(url);
  if (!isExactVercelDeploymentUrl(url)) {
    throw new Error(
      'Origin-bound cookie requests require a trusted Jovie deployment URL.'
    );
  }
  const cookie = cookieHeader?.trim();
  if (!cookie) {
    throw new Error('An exact-host authorization cookie is required.');
  }
  return {
    url,
    options: {
      headers: { ...headers, Cookie: cookie },
      redirect: 'manual',
    },
  };
}

function validateCookieField(value) {
  return (
    typeof value === 'string' && value.length > 0 && !/[\0\t\r\n;]/.test(value)
  );
}

function parseExactHostCookieJar(contents, targetUrl) {
  const target = parseProbeUrl(targetUrl);
  if (!isExactVercelDeploymentUrl(target)) {
    throw new Error('Cookie jar target must be a trusted Jovie deployment.');
  }
  const cookies = [];
  for (const rawLine of contents.split(/\r?\n/)) {
    let line = rawLine;
    if (line.startsWith('#HttpOnly_')) line = line.slice('#HttpOnly_'.length);
    if (!line || line.startsWith('#')) continue;
    const fields = line.split('\t');
    if (
      fields.length !== 7 ||
      fields[0] !== target.hostname ||
      fields[1] !== 'FALSE' ||
      fields[2] !== '/' ||
      fields[3] !== 'TRUE' ||
      !validateCookieField(fields[5]) ||
      !validateCookieField(fields[6])
    ) {
      throw new Error('Cookie jar contains a non-origin-bound cookie.');
    }
    cookies.push(`${fields[5]}=${fields[6]}`);
  }
  if (cookies.length === 0) {
    throw new Error('Cookie jar contains no exact-host authorization cookie.');
  }
  return cookies.join('; ');
}

function readExactHostCookieJar(path, targetUrl) {
  if (!path) throw new Error('VERCEL_PROBE_COOKIE_JAR is required.');
  const stat = lstatSync(path, { bigint: true });
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    Number(stat.mode & 0o777n) !== 0o600
  ) {
    throw new Error(
      'VERCEL_PROBE_COOKIE_JAR must be a mode-0600 regular file.'
    );
  }
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let contents;
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (
      !before.isFile() ||
      `${stat.dev}:${stat.ino}` !== `${before.dev}:${before.ino}`
    ) {
      throw new Error('VERCEL_PROBE_COOKIE_JAR changed before reading.');
    }
    contents = readFileSync(descriptor, 'utf8');
    const after = fstatSync(descriptor, { bigint: true });
    if (
      `${before.dev}:${before.ino}:${before.size}:${before.mtimeNs}:${before.ctimeNs}` !==
      `${after.dev}:${after.ino}:${after.size}:${after.mtimeNs}:${after.ctimeNs}`
    ) {
      throw new Error('VERCEL_PROBE_COOKIE_JAR changed while reading.');
    }
  } finally {
    closeSync(descriptor);
  }
  return parseExactHostCookieJar(contents, targetUrl);
}

function writeExactHostCookieJar(path, targetUrl, cookies) {
  if (!path) throw new Error('VERCEL_PROBE_COOKIE_JAR is required.');
  const target = parseProbeUrl(targetUrl, 'Cookie jar target');
  if (!isExactVercelDeploymentUrl(target)) {
    throw new Error('Cookie jar target must be a trusted Jovie deployment.');
  }
  let expectedIdentity;
  let flags = constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW;
  if (existsSync(path)) {
    const stat = lstatSync(path, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error('VERCEL_PROBE_COOKIE_JAR must be a regular file.');
    }
    expectedIdentity = `${stat.dev}:${stat.ino}`;
  } else {
    flags |= constants.O_CREAT | constants.O_EXCL;
  }
  const lines = ['# Netscape HTTP Cookie File'];
  for (const cookie of cookies) {
    if (
      !validateCookieField(cookie.name) ||
      !validateCookieField(cookie.value)
    ) {
      throw new Error('Vercel bypass produced malformed cookie state.');
    }
    lines.push(
      [
        target.hostname,
        'FALSE',
        '/',
        'TRUE',
        '0',
        cookie.name,
        cookie.value,
      ].join('\t')
    );
  }
  if (lines.length === 1) {
    throw new Error('Vercel bypass produced no cookie state.');
  }
  const descriptor = openSync(path, flags, 0o600);
  try {
    const stat = fstatSync(descriptor, { bigint: true });
    if (
      !stat.isFile() ||
      (expectedIdentity && expectedIdentity !== `${stat.dev}:${stat.ino}`)
    ) {
      throw new Error('VERCEL_PROBE_COOKIE_JAR changed before writing.');
    }
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, `${lines.join('\n')}\n`, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

function assertOriginBoundRedirect(requestedUrl, location) {
  const requested = parseProbeUrl(requestedUrl, 'Protected probe request');
  let destination;
  try {
    destination = parseProbeUrl(
      new URL(location, requested),
      'Protected probe redirect'
    );
  } catch {
    throw new Error('Protected probe returned a malformed redirect location.');
  }

  if (destination.origin !== requested.origin) {
    throw new Error(
      `Refusing cross-origin protected-probe redirect from ${requested.origin} to ${destination.origin}.`
    );
  }
  if (
    destination.pathname !== requested.pathname ||
    destination.search !== requested.search
  ) {
    throw new Error(
      `Protected probe redirect left the requested route ${safeRouteLabel(requested)}.`
    );
  }

  return destination;
}

function getResponseRedirect(response, requestedUrl) {
  if (response.status < 300 || response.status >= 400) return null;

  const location = response.headers.get('location');
  if (!location) {
    throw new Error(
      `Protected probe returned HTTP ${response.status} without a redirect location.`
    );
  }
  return assertOriginBoundRedirect(requestedUrl, location);
}

function assertExactProbeResponse(
  response,
  requestedUrl,
  { allowSameOriginRedirect = false } = {}
) {
  const expected = parseProbeUrl(requestedUrl);
  if (typeof response.url !== 'string' || response.url.length === 0) {
    throw new Error(
      'Protected probe response did not preserve its request URL.'
    );
  }
  const finalUrl = parseProbeUrl(response.url, 'Probe response URL');
  if (
    finalUrl.origin !== expected.origin ||
    finalUrl.pathname !== expected.pathname ||
    finalUrl.search !== expected.search
  ) {
    throw new Error(
      `Protected probe resolved outside the requested route ${safeRouteLabel(expected)}.`
    );
  }

  const redirect = getResponseRedirect(response, expected);
  if (redirect) {
    if (allowSameOriginRedirect) return { redirect };
    throw new Error(
      `Unexpected same-origin redirect while probing ${safeRouteLabel(expected)}.`
    );
  }

  return { redirect: null };
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }

  const combined = response.headers.get('set-cookie');
  return combined ? [combined] : [];
}

function parseOriginBoundCookies(response, targetUrl) {
  const target = parseProbeUrl(targetUrl);
  const cookieHeaders = getSetCookieHeaders(response);
  const cookies = [];

  for (const cookieHeader of cookieHeaders) {
    if (/;\s*domain\s*=/i.test(cookieHeader)) {
      throw new Error(
        'Vercel bypass bootstrap returned a domain-scoped authorization cookie.'
      );
    }
    if (!/;\s*path\s*=\s*\/(?:;|$)/i.test(cookieHeader)) {
      throw new Error(
        'Vercel bypass bootstrap returned an authorization cookie outside the root path.'
      );
    }
    if (!/;\s*secure(?:;|$)/i.test(cookieHeader)) {
      throw new Error(
        'Vercel bypass bootstrap returned an insecure authorization cookie.'
      );
    }
    const firstSegment = cookieHeader.split(';', 1)[0] ?? '';
    const separator = firstSegment.indexOf('=');
    if (separator <= 0) continue;

    const name = firstSegment.slice(0, separator).trim();
    const value = firstSegment.slice(separator + 1).trim();
    if (!validateCookieField(name) || !validateCookieField(value)) continue;

    cookies.push({
      name,
      value,
      url: target.origin,
      secure: true,
      httpOnly: /;\s*httponly(?:;|$)/i.test(cookieHeader),
    });
  }

  if (cookies.length === 0) {
    throw new Error(
      'Vercel bypass bootstrap returned no origin-bound authorization cookie.'
    );
  }

  return cookies;
}

function cookiesToRequestHeader(cookies) {
  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
}

function escapeWorkflowCommandValue(value) {
  return value
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

function maskSensitiveValues(values, writeLine = value => console.log(value)) {
  const safeValues = [...new Set(values.filter(validateCookieField))];
  if (safeValues.length !== values.length || safeValues.length === 0) {
    throw new Error('Protected probe produced malformed sensitive state.');
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const value of safeValues) {
      writeLine(`::add-mask::${escapeWorkflowCommandValue(value)}`);
    }
  }
  return safeValues;
}

function createAbsoluteDeadline(
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  label = 'Protected deployment verification'
) {
  const milliseconds = Number(timeoutMs);
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 1_000 ||
    milliseconds > 15 * 60_000
  ) {
    throw new Error('Probe timeout must be between 1000 and 900000 ms.');
  }

  const controller = new AbortController();
  const expiresAt = Date.now() + milliseconds;
  const timeoutError = new Error(`${label} exceeded its absolute deadline.`);
  let expired = false;
  let rejectDeadline;
  const deadlinePromise = new Promise((_, reject) => {
    rejectDeadline = reject;
  });
  // Every operation races this promise. This catch prevents a late timeout from
  // becoming unhandled if cleanup wins the same event-loop turn.
  void deadlinePromise.catch(() => {});
  const timer = setTimeout(() => {
    expired = true;
    controller.abort(timeoutError);
    rejectDeadline(timeoutError);
  }, milliseconds);

  return {
    signal: controller.signal,
    remainingMs: () => Math.max(0, expiresAt - Date.now()),
    async run(operation) {
      if (expired || controller.signal.aborted) throw timeoutError;
      try {
        return await Promise.race([
          Promise.resolve().then(() => operation(controller.signal)),
          deadlinePromise,
        ]);
      } catch (error) {
        if (expired || controller.signal.aborted) throw timeoutError;
        throw error;
      }
    },
    async pause(millisecondsToWait) {
      await this.run(
        signal =>
          new Promise((resolvePause, rejectPause) => {
            const onAbort = () => {
              clearTimeout(wait);
              rejectPause(timeoutError);
            };
            const wait = setTimeout(() => {
              signal.removeEventListener('abort', onAbort);
              resolvePause();
            }, millisecondsToWait);
            signal.addEventListener('abort', onAbort, { once: true });
          })
      );
    },
    dispose() {
      clearTimeout(timer);
      controller.abort();
    },
  };
}

async function fetchWithinDeadline(deadline, fetchImpl, url, options = {}) {
  return deadline.run(signal => fetchImpl(url, { ...options, signal }));
}

async function discardResponseBody(response) {
  if (response.body && typeof response.body.cancel === 'function') {
    await response.body.cancel().catch(() => {});
    return;
  }
  if (typeof response.text === 'function') {
    await response.text().catch(() => {});
  }
}

async function readResponseText(response, deadline) {
  if (typeof response.text !== 'function') {
    throw new Error('Protected probe response body is unavailable.');
  }
  return deadline ? deadline.run(() => response.text()) : response.text();
}

function validateBuildInfo(payload, expectedCommitSha, expectedEnvironment) {
  const expectedSha = requireFullCommitSha(expectedCommitSha);
  const environment = requireExpectedEnvironment(expectedEnvironment);
  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.commitSha !== 'string' ||
    !BUILD_COMMIT_SHA.test(payload.commitSha) ||
    typeof payload.buildId !== 'string' ||
    payload.buildId.length === 0 ||
    payload.environment !== environment
  ) {
    throw new Error(
      'Exact Vercel deployment bypass verification returned malformed or wrong-environment build identity.'
    );
  }
  if (!expectedSha.startsWith(payload.commitSha)) {
    throw new Error(
      'Exact Vercel deployment bypass verification returned the wrong commit.'
    );
  }
  return payload;
}

async function readVerifiedBuildInfo(
  response,
  requestedUrl,
  expectedCommitSha,
  expectedEnvironment,
  deadline
) {
  assertExactProbeResponse(response, requestedUrl);
  if (response.status !== 200) {
    throw new Error(
      `Exact Vercel deployment bypass verification returned HTTP ${response.status}.`
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(
      'Exact Vercel deployment bypass verification did not return JSON build identity.'
    );
  }

  const body = await readResponseText(response, deadline);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(
      'Exact Vercel deployment bypass verification returned invalid JSON.'
    );
  }
  return validateBuildInfo(payload, expectedCommitSha, expectedEnvironment);
}

async function bootstrapOriginBoundAccess(
  rawTargetUrl,
  {
    fetchImpl = globalThis.fetch,
    bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    expectedCommitSha = process.env.EXPECTED_COMMIT_SHA,
    expectedDeploymentOrigin = process.env.EXPECTED_VERCEL_DEPLOYMENT_ORIGIN,
    expectedEnvironment = process.env.EXPECTED_VERCEL_ENVIRONMENT,
    timeoutMs = process.env.VERCEL_PROBE_TIMEOUT_MS ?? DEFAULT_PROBE_TIMEOUT_MS,
    deadline: suppliedDeadline,
    onSensitiveValues,
    onCookies,
  } = {}
) {
  const targetUrl = parseProbeUrl(rawTargetUrl, 'Protected deployment target');
  if (
    !isExactVercelDeploymentUrl(targetUrl) ||
    targetUrl.pathname !== '/' ||
    targetUrl.search
  ) {
    throw new Error(
      'Protected deployment target must identify one trusted Jovie deployment origin.'
    );
  }
  requireExpectedDeploymentOrigin(expectedDeploymentOrigin, targetUrl);
  const environment = requireExpectedEnvironment(expectedEnvironment);
  const expectedSha = requireFullCommitSha(expectedCommitSha);
  const deadline =
    suppliedDeadline ??
    createAbsoluteDeadline(timeoutMs, 'Protected deployment bootstrap');
  const ownsDeadline = !suppliedDeadline;

  try {
    const buildInfoUrl = new URL(BUILD_INFO_PATH, targetUrl.origin);
    const bootstrap = buildOriginBoundProbeRequest(buildInfoUrl, {
      bypassSecret,
      expectedDeploymentOrigin,
      setBypassCookie: true,
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
    const bootstrapResponse = await fetchWithinDeadline(
      deadline,
      fetchImpl,
      bootstrap.url,
      bootstrap.options
    );
    assertExactProbeResponse(bootstrapResponse, bootstrap.url, {
      allowSameOriginRedirect: true,
    });
    if (bootstrapResponse.status < 200 || bootstrapResponse.status >= 400) {
      await deadline.run(() => discardResponseBody(bootstrapResponse));
      throw new Error(
        `Vercel bypass bootstrap returned HTTP ${bootstrapResponse.status}.`
      );
    }

    const cookies = parseOriginBoundCookies(bootstrapResponse, targetUrl);
    const sensitiveValues = maskSensitiveValues(
      cookies.map(cookie => cookie.value)
    );
    if (onSensitiveValues) {
      await deadline.run(() => onSensitiveValues(sensitiveValues));
    }
    await deadline.run(() => discardResponseBody(bootstrapResponse));
    if (onCookies) await deadline.run(() => onCookies(cookies, targetUrl));

    const cookieHeader = cookiesToRequestHeader(cookies);
    const verification = buildOriginBoundCookieRequest(buildInfoUrl, {
      cookieHeader,
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
    const verificationResponse = await fetchWithinDeadline(
      deadline,
      fetchImpl,
      verification.url,
      verification.options
    );
    const buildInfo = await readVerifiedBuildInfo(
      verificationResponse,
      verification.url,
      expectedSha,
      environment,
      deadline
    );

    return { buildInfo, cookieHeader, cookies, targetUrl };
  } finally {
    if (ownsDeadline) deadline.dispose();
  }
}

async function bootstrapAliasBoundAccess(
  rawTargetUrl,
  {
    fetchImpl = globalThis.fetch,
    bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    expectedCommitSha = process.env.EXPECTED_COMMIT_SHA,
    expectedAliasOrigin = process.env.EXPECTED_VERCEL_ALIAS_ORIGIN,
    expectedEnvironment = process.env.EXPECTED_VERCEL_ENVIRONMENT,
    timeoutMs = process.env.VERCEL_PROBE_TIMEOUT_MS ?? DEFAULT_PROBE_TIMEOUT_MS,
    onSensitiveValues,
    onCookies,
  } = {}
) {
  const targetUrl = parseProbeUrl(rawTargetUrl, 'Protected alias target');
  if (
    !isTrustedVercelProtectedAliasUrl(targetUrl) ||
    targetUrl.pathname !== '/' ||
    targetUrl.search
  ) {
    throw new Error(
      'Protected alias target must identify one trusted Jovie alias origin.'
    );
  }
  requireExpectedProtectedAliasOrigin(expectedAliasOrigin, targetUrl);
  const environment = requireExpectedEnvironment(expectedEnvironment);
  const expectedSha = requireFullCommitSha(expectedCommitSha);
  const secret = bypassSecret?.trim();
  if (!secret) {
    throw new Error(
      'VERCEL_AUTOMATION_BYPASS_SECRET is required for a protected Vercel alias probe.'
    );
  }
  const deadline = createAbsoluteDeadline(
    timeoutMs,
    'Protected alias bootstrap'
  );

  try {
    const buildInfoUrl = new URL(BUILD_INFO_PATH, targetUrl.origin);
    const bootstrapResponse = await fetchWithinDeadline(
      deadline,
      fetchImpl,
      buildInfoUrl,
      {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          [BYPASS_HEADER]: secret,
          [SET_BYPASS_COOKIE_HEADER]: 'true',
        },
        redirect: 'manual',
      }
    );
    assertExactProbeResponse(bootstrapResponse, buildInfoUrl, {
      allowSameOriginRedirect: true,
    });
    if (bootstrapResponse.status < 200 || bootstrapResponse.status >= 400) {
      await deadline.run(() => discardResponseBody(bootstrapResponse));
      throw new Error(
        `Vercel alias bypass bootstrap returned HTTP ${bootstrapResponse.status}.`
      );
    }

    const cookies = parseOriginBoundCookies(bootstrapResponse, targetUrl);
    const sensitiveValues = maskSensitiveValues(
      cookies.map(cookie => cookie.value)
    );
    if (onSensitiveValues) {
      await deadline.run(() => onSensitiveValues(sensitiveValues));
    }
    await deadline.run(() => discardResponseBody(bootstrapResponse));
    if (onCookies) await deadline.run(() => onCookies(cookies, targetUrl));

    const verificationResponse = await fetchWithinDeadline(
      deadline,
      fetchImpl,
      buildInfoUrl,
      {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Cookie: cookiesToRequestHeader(cookies),
        },
        redirect: 'manual',
      }
    );
    const buildInfo = await readVerifiedBuildInfo(
      verificationResponse,
      buildInfoUrl,
      expectedSha,
      environment,
      deadline
    );
    return {
      buildInfo,
      cookieHeader: cookiesToRequestHeader(cookies),
      cookies,
      targetUrl,
    };
  } finally {
    deadline.dispose();
  }
}

async function verifyPublicSurfaceOnce(
  surface,
  targetUrl,
  cookieHeader,
  fetchImpl,
  deadline,
  cacheBust
) {
  const url = new URL(surface.path, targetUrl.origin);
  url.searchParams.set('_cb', cacheBust);
  const request = buildOriginBoundCookieRequest(url, {
    cookieHeader,
    headers: {
      Accept: surface.json ? 'application/json' : 'text/html',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      'User-Agent': 'Mozilla/5.0 (compatible; JovieCI/1.0; +https://jov.ie)',
    },
  });
  const response = await fetchWithinDeadline(
    deadline,
    fetchImpl,
    request.url,
    request.options
  );
  assertExactProbeResponse(response, request.url);
  if (response.status !== 200) {
    await deadline.run(() => discardResponseBody(response));
    throw new Error(`${surface.label} returned HTTP ${response.status}.`);
  }

  const contentType = (
    response.headers.get('content-type') ?? ''
  ).toLowerCase();
  const body = await readResponseText(response, deadline);
  if (surface.json) {
    if (!contentType.includes('application/json')) {
      throw new Error(`${surface.label} did not return JSON.`);
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new Error(`${surface.label} returned invalid JSON.`);
    }
    if (!payload || typeof payload !== 'object' || payload.status !== 'ok') {
      throw new Error(`${surface.label} did not report healthy status.`);
    }
    if (
      Object.hasOwn(payload, 'database') &&
      payload.database !== 'ok' &&
      !(
        payload.database &&
        typeof payload.database === 'object' &&
        payload.database.ok === true
      )
    ) {
      throw new Error(
        `${surface.label} did not report healthy database state.`
      );
    }
    return;
  }

  if (!contentType.includes('text/html')) {
    throw new Error(`${surface.label} did not return HTML.`);
  }
  if (
    Buffer.byteLength(body) < surface.minimumBytes ||
    !/<html(?:\s|>)/i.test(body) ||
    !/<body(?:\s|>)/i.test(body)
  ) {
    throw new Error(`${surface.label} returned an incomplete document.`);
  }
  const semanticHtml = projectSemanticHtml(body);
  if (PUBLIC_ERROR_CONTENT.test(semanticHtml)) {
    throw new Error(`${surface.label} returned error or not-found content.`);
  }
  if (
    surface.requiredContent &&
    !semanticHtml.includes(surface.requiredContent)
  ) {
    throw new Error(`${surface.label} omitted its semantic sentinel.`);
  }
}

async function verifyPublicDeploymentSurfaces(
  rawTargetUrl,
  {
    cookieHeader,
    fetchImpl = globalThis.fetch,
    deadline: suppliedDeadline,
    timeoutMs = process.env.VERCEL_PROBE_TIMEOUT_MS ?? DEFAULT_PROBE_TIMEOUT_MS,
    attempts = 3,
  } = {}
) {
  const targetUrl = parseProbeUrl(rawTargetUrl, 'Public deployment target');
  if (
    !isExactVercelDeploymentUrl(targetUrl) ||
    targetUrl.pathname !== '/' ||
    targetUrl.search
  ) {
    throw new Error(
      'Public deployment target must identify one trusted Jovie deployment origin.'
    );
  }
  const exactCookieHeader = cookieHeader?.trim();
  if (!exactCookieHeader) {
    throw new Error(
      'Public deployment verification requires an exact-host cookie.'
    );
  }
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new Error('Public surface attempts must be bounded to 1-5.');
  }
  const deadline =
    suppliedDeadline ??
    createAbsoluteDeadline(timeoutMs, 'Public surface verification');
  const ownsDeadline = !suppliedDeadline;
  const surfaces = [
    { label: 'Health', path: '/api/health', json: true },
    ...PUBLIC_HTML_SURFACES,
  ];

  try {
    for (const [index, surface] of surfaces.entries()) {
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          await verifyPublicSurfaceOnce(
            surface,
            targetUrl,
            exactCookieHeader,
            fetchImpl,
            deadline,
            `${Date.now()}-${index}-${attempt}`
          );
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < attempts) await deadline.pause(1_000 * attempt);
        }
      }
      if (lastError) throw lastError;
    }
  } finally {
    if (ownsDeadline) deadline.dispose();
  }
}

function normalizeDeploymentUrl(rawUrl, label = 'Vercel deployment URL') {
  const value = rawUrl?.trim();
  if (!value) return undefined;
  const prefixed = value.includes('://') ? value : `https://${value}`;
  const url = parseProbeUrl(prefixed, label);
  if (!isExactVercelDeploymentUrl(url) || url.pathname !== '/' || url.search) {
    throw new Error(`${label} must identify one trusted Jovie deployment.`);
  }
  return url.origin;
}

function deploymentCommitSha(deployment) {
  return deployment?.meta?.githubCommitSha ?? deployment?.gitSource?.sha;
}

function deploymentState(deployment) {
  return String(
    deployment?.readyState ?? deployment?.state ?? deployment?.status ?? ''
  )
    .trim()
    .toUpperCase();
}

async function readJsonResponse(response, label, deadline) {
  if (!response || response.status !== 200) {
    if (response) await deadline.run(() => discardResponseBody(response));
    throw new Error(`${label} returned a non-success response.`);
  }
  const body = await readResponseText(response, deadline);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} returned malformed JSON.`);
  }
}

async function resolveAuthorizedVercelDeployment({
  fetchImpl = globalThis.fetch,
  token = process.env.VERCEL_TOKEN,
  orgId = process.env.VERCEL_ORG_ID,
  projectId = process.env.VERCEL_PROJECT_ID,
  commitSha = process.env.EXPECTED_COMMIT_SHA ?? process.env.COMMIT_SHA,
  candidateUrl = process.env.VERCEL_CANDIDATE_DEPLOYMENT_URL,
  candidateId = process.env.VERCEL_CANDIDATE_DEPLOYMENT_ID,
  maxPages = process.env.VERCEL_DEPLOYMENT_MAX_PAGES ??
    DEFAULT_VERCEL_API_PAGES,
  timeoutMs = process.env.VERCEL_API_TIMEOUT_MS ?? 30_000,
  initialWaitMs = process.env.VERCEL_DEPLOYMENT_INITIAL_WAIT_MS ?? 0,
  pollIntervalMs = process.env.VERCEL_DEPLOYMENT_POLL_INTERVAL_MS ??
    DEFAULT_VERCEL_DEPLOYMENT_POLL_INTERVAL_MS,
} = {}) {
  const credential = token?.trim();
  const project = projectId?.trim();
  const expectedSha = requireFullCommitSha(commitSha);
  const exactCandidateUrl = normalizeDeploymentUrl(candidateUrl);
  const exactCandidateId = candidateId?.trim() || undefined;
  const pages = Number(maxPages);
  const initialDelay = Number(initialWaitMs);
  const pollInterval = Number(pollIntervalMs);
  if (!credential || !project) {
    throw new Error(
      'Vercel deployment resolution requires token and project ID.'
    );
  }
  if (exactCandidateId && !DEPLOYMENT_ID.test(exactCandidateId)) {
    throw new Error('Vercel candidate deployment ID is malformed.');
  }
  if (!Number.isSafeInteger(pages) || pages < 1 || pages > 20) {
    throw new Error(
      'Vercel deployment pagination must be bounded to 1-20 pages.'
    );
  }
  if (
    !Number.isSafeInteger(initialDelay) ||
    initialDelay < 0 ||
    initialDelay > 5 * 60_000
  ) {
    throw new Error('Vercel deployment initial wait must be 0-300000 ms.');
  }
  if (
    !Number.isSafeInteger(pollInterval) ||
    pollInterval < 1 ||
    pollInterval > 30_000
  ) {
    throw new Error('Vercel deployment poll interval must be 1-30000 ms.');
  }

  const deadline = createAbsoluteDeadline(
    timeoutMs,
    'Vercel deployment lookup'
  );
  try {
    if (initialDelay > 0) await deadline.pause(initialDelay);

    // Vercel's list endpoint can lag the deploy response, and a deployment may
    // remain BUILDING/QUEUED/INITIALIZING after `vercel inspect --wait` returns.
    // Re-scan from page one under one absolute deadline until the exact URL, ID,
    // project, and full commit SHA all converge to READY. The READY query filter
    // is intentionally omitted so a transient state cannot masquerade as a
    // missing deployment.
    for (;;) {
      const matchingReady = new Map();
      let matchingTransient = false;
      let scanInterrupted = false;
      let until;

      for (let page = 0; page < pages; page += 1) {
        const url = new URL('https://api.vercel.com/v6/deployments');
        url.searchParams.set('projectId', project);
        url.searchParams.set('limit', '100');
        if (orgId?.startsWith('team_')) url.searchParams.set('teamId', orgId);
        if (until !== undefined) url.searchParams.set('until', String(until));
        let response;
        try {
          response = await fetchWithinDeadline(deadline, fetchImpl, url, {
            headers: { Authorization: `Bearer ${credential}` },
            redirect: 'manual',
          });
        } catch (error) {
          if (deadline.remainingMs() === 0) throw error;
          matchingTransient = true;
          scanInterrupted = true;
          break;
        }
        if (TRANSIENT_VERCEL_API_STATUSES.has(response?.status)) {
          await deadline.run(() => discardResponseBody(response));
          matchingTransient = true;
          scanInterrupted = true;
          break;
        }
        const payload = await readJsonResponse(
          response,
          'Vercel deployment API',
          deadline
        );
        if (!payload || !Array.isArray(payload.deployments)) {
          throw new Error('Vercel deployment API omitted the deployment list.');
        }
        for (const deployment of payload.deployments) {
          const rawId = deployment?.uid ?? deployment?.id;
          const id =
            typeof rawId === 'string' && rawId.trim()
              ? rawId.trim()
              : undefined;
          let urlOrigin;
          const rawDeploymentUrl = deployment?.url;
          try {
            urlOrigin = normalizeDeploymentUrl(rawDeploymentUrl);
          } catch (error) {
            if (exactCandidateId && exactCandidateId === id) throw error;
            continue;
          }
          const idMatches = Boolean(
            exactCandidateId && exactCandidateId === id
          );
          const urlMatches = Boolean(
            exactCandidateUrl && exactCandidateUrl === urlOrigin
          );
          const candidatePartiallyMatches =
            Boolean(exactCandidateId || exactCandidateUrl) &&
            (idMatches || urlMatches);

          if (exactCandidateId || exactCandidateUrl) {
            if (!candidatePartiallyMatches) continue;

            // Vercel can publish deployment fields in separate list-indexing
            // passes. An absent URL/ID is propagation lag; a present malformed
            // or contradictory value is identity evidence and fails closed.
            if (
              rawId !== undefined &&
              rawId !== null &&
              !DEPLOYMENT_ID.test(id ?? '')
            ) {
              throw new Error(
                'Exact caller deployment returned a malformed deployment ID.'
              );
            }
            if (!id || !urlOrigin) {
              const partialState = deploymentState(deployment);
              if (
                partialState &&
                partialState !== 'READY' &&
                !TRANSIENT_DEPLOYMENT_STATES.has(partialState)
              ) {
                throw new Error(
                  `Exact caller deployment entered terminal or unknown state ${partialState}.`
                );
              }
              matchingTransient = true;
              continue;
            }
            if (
              (exactCandidateId && !idMatches) ||
              (exactCandidateUrl && !urlMatches)
            ) {
              throw new Error(
                'Exact caller deployment URL and ID resolved to different deployments.'
              );
            }
          } else if (deploymentCommitSha(deployment) !== expectedSha) {
            continue;
          }

          if (!DEPLOYMENT_ID.test(id ?? '') || !urlOrigin) continue;
          if (
            deployment.projectId === undefined ||
            deployment.projectId === null
          ) {
            matchingTransient = true;
            continue;
          }
          if (
            typeof deployment.projectId !== 'string' ||
            deployment.projectId !== project
          ) {
            throw new Error(
              'Exact caller deployment resolved outside the authorized Vercel project.'
            );
          }
          const state = deploymentState(deployment);
          const observedSha = deploymentCommitSha(deployment);
          if (!state) {
            matchingTransient = true;
            continue;
          }
          if (state !== 'READY' && !TRANSIENT_DEPLOYMENT_STATES.has(state)) {
            throw new Error(
              `Exact caller deployment entered terminal or unknown state ${state || '<empty>'}.`
            );
          }
          if (
            observedSha === undefined ||
            observedSha === null ||
            observedSha === ''
          ) {
            // READY can precede Git metadata propagation. Missing SHA remains
            // transient, but a present malformed or wrong SHA fails below.
            matchingTransient = true;
            continue;
          }
          if (
            typeof observedSha !== 'string' ||
            !FULL_COMMIT_SHA.test(observedSha) ||
            observedSha !== expectedSha
          ) {
            throw new Error(
              'Exact caller deployment does not match the full expected commit SHA.'
            );
          }

          if (state === 'READY') {
            matchingReady.set(id, { id, url: urlOrigin });
            if (exactCandidateId || exactCandidateUrl) {
              return { id, url: urlOrigin };
            }
          } else {
            matchingTransient = true;
          }
        }

        const next = payload.pagination?.next;
        if (next === null || next === undefined || next === until) break;
        if (typeof next !== 'number' && typeof next !== 'string') {
          throw new Error('Vercel deployment pagination cursor is malformed.');
        }
        until = next;
      }

      if (!exactCandidateId && !exactCandidateUrl && !scanInterrupted) {
        if (matchingReady.size === 1) return [...matchingReady.values()][0];
        if (matchingReady.size > 1) {
          throw new Error(
            'Commit-only Vercel deployment fallback is missing or ambiguous; provide the exact deployment URL/ID.'
          );
        }
      }

      // Missing exact evidence is treated as bounded list propagation lag;
      // known transient states are treated the same way. The absolute deadline
      // aborts both the pause and every fetch, so this cannot spin forever.
      await deadline.pause(
        matchingTransient ? pollInterval : Math.min(pollInterval, 1_000)
      );
    }
  } finally {
    deadline.dispose();
  }
}

async function bootstrapAndVerifyFromEnvironment() {
  const target = process.env.VERCEL_PROBE_URL;
  const jarPath = process.env.VERCEL_PROBE_COOKIE_JAR;
  const deadline = createAbsoluteDeadline(
    process.env.VERCEL_PROBE_TIMEOUT_MS ?? DEFAULT_PROBE_TIMEOUT_MS,
    'Protected deployment bootstrap and verification'
  );
  try {
    const access = await bootstrapOriginBoundAccess(target, { deadline });
    writeExactHostCookieJar(jarPath, access.targetUrl, access.cookies);
    if (process.env.VERCEL_VERIFY_PUBLIC_SURFACES === 'true') {
      await verifyPublicDeploymentSurfaces(access.targetUrl, {
        cookieHeader: access.cookieHeader,
        deadline,
      });
    }
    console.log(
      `[vercel-protected-origin] Verified ${safeRouteLabel(access.targetUrl)} as ${access.buildInfo.environment}.`
    );
  } finally {
    deadline.dispose();
  }
}

module.exports = {
  BUILD_INFO_PATH,
  BYPASS_HEADER,
  DEFAULT_PROBE_TIMEOUT_MS,
  PUBLIC_HTML_SURFACES,
  SET_BYPASS_COOKIE_HEADER,
  assertAuthorizedDeploymentOrigin,
  assertExactProbeResponse,
  assertOriginBoundRedirect,
  bootstrapAliasBoundAccess,
  bootstrapOriginBoundAccess,
  buildOriginBoundCookieRequest,
  buildOriginBoundProbeRequest,
  cookiesToRequestHeader,
  createAbsoluteDeadline,
  isExactVercelDeploymentUrl,
  isTrustedVercelProtectedAliasUrl,
  maskSensitiveValues,
  parseOriginBoundCookies,
  parseExactHostCookieJar,
  parseProbeUrl,
  readExactHostCookieJar,
  readVerifiedBuildInfo,
  requireExpectedEnvironment,
  resolveAuthorizedVercelDeployment,
  safeRouteLabel,
  stripInlineScripts,
  validateBuildInfo,
  verifyPublicDeploymentSurfaces,
  writeExactHostCookieJar,
};

if (require.main === module) {
  void (async () => {
    const [command, first, second] = process.argv.slice(2);
    if (command === 'assert-authorized-origin' && first && second) {
      assertAuthorizedDeploymentOrigin(first, second);
    } else if (command === 'assert-origin-bound-redirect' && first && second) {
      assertOriginBoundRedirect(first, second);
    } else if (command === 'resolve-deployment') {
      process.stdout.write(
        `${JSON.stringify(await resolveAuthorizedVercelDeployment())}\n`
      );
    } else if (command === 'bootstrap-cookie-jar') {
      await bootstrapAndVerifyFromEnvironment();
    } else {
      throw new Error(
        'Usage: vercel-protected-origin.cjs <assert-authorized-origin|assert-origin-bound-redirect|resolve-deployment|bootstrap-cookie-jar>'
      );
    }
  })().catch(error => {
    console.error(
      '[vercel-protected-origin] Failed:',
      error instanceof Error ? error.message : 'Unknown error.'
    );
    process.exitCode = 1;
  });
}
