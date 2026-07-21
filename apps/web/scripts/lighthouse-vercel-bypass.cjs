'use strict';

const {
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  writeSync,
} = require('node:fs');

const {
  bootstrapAliasBoundAccess,
  bootstrapOriginBoundAccess,
  isExactVercelDeploymentUrl,
  isTrustedVercelProtectedAliasUrl,
  maskSensitiveValues,
  parseProbeUrl,
  PUBLIC_PROBE_COOKIE_NAMES,
  readVerifiedBuildInfo,
  safeRouteLabel,
  validateBuildInfo,
} = require('./vercel-protected-origin.cjs');

const COOKIE_SCOPE_PROBE_PATH = '/__jovie_cookie_scope_probe__';

function recordSensitiveValues(path, values) {
  const safeValues = maskSensitiveValues(values);
  if (!path) return;
  let expectedIdentity;
  let flags = constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW;
  if (existsSync(path)) {
    const stat = lstatSync(path, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(
        'Lighthouse sensitive-values receipt must be a regular file.'
      );
    }
    expectedIdentity = `${stat.dev}:${stat.ino}`;
  } else {
    flags |= constants.O_CREAT | constants.O_EXCL;
  }
  const descriptor = openSync(path, flags, 0o600);
  try {
    const stat = fstatSync(descriptor, { bigint: true });
    if (
      !stat.isFile() ||
      (expectedIdentity && expectedIdentity !== `${stat.dev}:${stat.ino}`)
    ) {
      throw new Error(
        'Lighthouse sensitive-values receipt changed before writing.'
      );
    }
    fchmodSync(descriptor, 0o600);
    writeSync(descriptor, `${safeValues.join('\n')}\n`, null, 'utf8');
  } finally {
    closeSync(descriptor);
  }
}

function sensitiveCookieValues(cookies) {
  return cookies
    .filter(cookie => !PUBLIC_PROBE_COOKIE_NAMES.has(cookie.name))
    .map(cookie => cookie.value);
}

function parseRequestCookieHeader(header) {
  const cookies = new Map();
  for (const segment of (header ?? '').split(';')) {
    const separator = segment.indexOf('=');
    if (separator <= 0) continue;
    cookies.set(
      segment.slice(0, separator).trim(),
      segment.slice(separator + 1).trim()
    );
  }
  return cookies;
}

function validateCookieOriginBoundaryHeaders(
  exactHostHeader,
  childHostHeader,
  expectedCookies
) {
  const exactCookies = parseRequestCookieHeader(exactHostHeader);
  const childCookies = parseRequestCookieHeader(childHostHeader);
  if (
    expectedCookies.some(
      cookie => exactCookies.get(cookie.name) !== cookie.value
    )
  ) {
    throw new Error(
      'Browser did not attach the protected probe cookie to its exact deployment origin.'
    );
  }
  if (expectedCookies.some(cookie => childCookies.has(cookie.name))) {
    throw new Error(
      'Browser would attach protected probe state to a deployment subdomain.'
    );
  }
}

async function captureBrowserRequestCookieHeader(browser, url) {
  const page = await browser.newPage();
  let timeout;
  try {
    await page.setRequestInterception(true);
    const headerPromise = new Promise((resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Browser cookie-boundary probe timed out.')),
        5_000
      );
      page.on('request', request => {
        if (
          typeof request.isNavigationRequest === 'function' &&
          !request.isNavigationRequest()
        ) {
          void request.abort().catch(() => {});
          return;
        }
        const headers = request.headers();
        resolve(typeof headers.cookie === 'string' ? headers.cookie : '');
        void request.abort().catch(() => {});
      });
    });
    const navigation = page
      .goto(url.href, { waitUntil: 'domcontentloaded', timeout: 5_000 })
      .catch(() => undefined);
    const header = await headerPromise;
    await navigation;
    return header;
  } finally {
    if (timeout) clearTimeout(timeout);
    await page.close();
  }
}

async function assertBrowserCookieOriginBoundary(browser, rawUrl, cookies) {
  const target = parseProbeUrl(rawUrl, 'Browser cookie target');
  if (
    !isExactVercelDeploymentUrl(target) &&
    !isTrustedVercelProtectedAliasUrl(target)
  ) {
    throw new Error(
      'Browser cookie boundary requires a trusted Jovie deployment target.'
    );
  }
  const exactProbe = new URL(COOKIE_SCOPE_PROBE_PATH, target.origin);
  const childProbe = new URL(exactProbe);
  childProbe.hostname = `cookie-boundary.${target.hostname}`;
  const [exactHostHeader, childHostHeader] = await Promise.all([
    captureBrowserRequestCookieHeader(browser, exactProbe),
    captureBrowserRequestCookieHeader(browser, childProbe),
  ]);
  validateCookieOriginBoundaryHeaders(
    exactHostHeader,
    childHostHeader,
    cookies
  );
}

async function primeLighthouseVercelAliasBypass(
  browser,
  { url: rawUrl },
  {
    fetchImpl = globalThis.fetch,
    bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    expectedCommitSha = process.env.EXPECTED_COMMIT_SHA,
    expectedAliasOrigin = process.env.EXPECTED_VERCEL_ALIAS_ORIGIN,
    expectedEnvironment = process.env.EXPECTED_VERCEL_ENVIRONMENT,
    sensitiveValuesPath = process.env.LIGHTHOUSE_SENSITIVE_VALUES_FILE,
    recordSensitiveValuesImpl = recordSensitiveValues,
    assertBrowserCookieOriginBoundaryImpl = assertBrowserCookieOriginBoundary,
  } = {}
) {
  const targetUrl = parseProbeUrl(rawUrl, 'Protected alias URL');
  if (!isTrustedVercelProtectedAliasUrl(targetUrl)) {
    throw new Error(
      'Protected alias bootstrap requires a trusted Jovie alias target.'
    );
  }

  await bootstrapAliasBoundAccess(targetUrl.origin, {
    fetchImpl,
    bypassSecret,
    expectedCommitSha,
    expectedAliasOrigin,
    expectedEnvironment,
    onSensitiveValues: cookies =>
      recordSensitiveValuesImpl(
        sensitiveValuesPath,
        sensitiveCookieValues(cookies)
      ),
    onCookies: async (cookies, verifiedTargetUrl) => {
      await browser.defaultBrowserContext().setCookie(...cookies);
      await assertBrowserCookieOriginBoundaryImpl(
        browser,
        verifiedTargetUrl,
        cookies
      );
    },
  });

  console.log(
    `[lighthouse:bypass] Origin-bound alias access verified for ${safeRouteLabel(targetUrl)}.`
  );
}

async function primeLighthouseVercelBypass(
  browser,
  { url: rawUrl },
  {
    fetchImpl = globalThis.fetch,
    bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    expectedCommitSha = process.env.EXPECTED_COMMIT_SHA,
    expectedDeploymentOrigin = process.env.EXPECTED_VERCEL_DEPLOYMENT_ORIGIN,
    expectedEnvironment = process.env.EXPECTED_VERCEL_ENVIRONMENT,
    sensitiveValuesPath = process.env.LIGHTHOUSE_SENSITIVE_VALUES_FILE,
    recordSensitiveValuesImpl = recordSensitiveValues,
    assertBrowserCookieOriginBoundaryImpl = assertBrowserCookieOriginBoundary,
  } = {}
) {
  const targetUrl = parseProbeUrl(rawUrl, 'Lighthouse target URL');
  if (!isExactVercelDeploymentUrl(targetUrl)) {
    throw new Error(
      'Lighthouse protected-origin bootstrap requires a trusted Jovie deployment target.'
    );
  }

  await bootstrapOriginBoundAccess(targetUrl.origin, {
    fetchImpl,
    bypassSecret,
    expectedCommitSha,
    expectedDeploymentOrigin,
    expectedEnvironment,
    onSensitiveValues: cookies =>
      recordSensitiveValuesImpl(
        sensitiveValuesPath,
        sensitiveCookieValues(cookies)
      ),
    onCookies: async (cookies, verifiedTargetUrl) => {
      await browser.defaultBrowserContext().setCookie(...cookies);
      await assertBrowserCookieOriginBoundaryImpl(
        browser,
        verifiedTargetUrl,
        cookies
      );
    },
  });

  console.log(
    `[lighthouse:bypass] Origin-bound deployment access verified for ${safeRouteLabel(targetUrl)}.`
  );
}

module.exports = primeLighthouseVercelBypass;
module.exports.primeLighthouseVercelBypass = primeLighthouseVercelBypass;
module.exports.primeLighthouseVercelAliasBypass =
  primeLighthouseVercelAliasBypass;
module.exports.assertBrowserCookieOriginBoundary =
  assertBrowserCookieOriginBoundary;
module.exports.readVerifiedBuildInfo = readVerifiedBuildInfo;
module.exports.recordSensitiveValues = recordSensitiveValues;
module.exports.sensitiveCookieValues = sensitiveCookieValues;
module.exports.validateCookieOriginBoundaryHeaders =
  validateCookieOriginBoundaryHeaders;
module.exports.validateBuildInfo = validateBuildInfo;
