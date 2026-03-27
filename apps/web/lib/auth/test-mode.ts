export const TEST_MODE_HEADER = 'x-test-mode';
export const TEST_USER_ID_HEADER = 'x-test-user-id';
export const TEST_AUTH_BYPASS_MODE = 'bypass-auth';
export const TEST_MODE_COOKIE = '__e2e_test_mode';
export const TEST_USER_ID_COOKIE = '__e2e_test_user_id';

export function isTestAuthBypassEnabled(): boolean {
  return process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
}

interface HeaderReader {
  get(name: string): string | null;
}

interface CookieReader {
  get(name: string): { value: string } | undefined;
}

function normalizeHeaderValue(value: string | null): string | null {
  return value?.trim() || null;
}

function extractHostname(value: string | null): string | null {
  const normalized = normalizeHeaderValue(value)?.split(',')[0]?.trim() ?? null;
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      return new URL(normalized).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  return normalized.replace(/:\d+$/, '').toLowerCase();
}

function isLoopbackHost(hostname: string | null): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    Boolean(hostname?.endsWith('.localhost'))
  );
}

function isTrustedTestBypassRequest(headerReader: HeaderReader): boolean {
  const hostname =
    extractHostname(headerReader.get('x-forwarded-host')) ??
    extractHostname(headerReader.get('host')) ??
    extractHostname(headerReader.get('origin')) ??
    extractHostname(headerReader.get('referer'));

  return isLoopbackHost(hostname);
}
function getCookieValueFromHeader(
  headerReader: HeaderReader,
  cookieName: string
): string | null {
  const cookieHeader = headerReader.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookie.split('=');
    if (name?.trim() !== cookieName) {
      continue;
    }

    return decodeURIComponent(valueParts.join('=').trim());
  }

  return null;
}

/**
 * Returns a mocked auth userId when test bypass headers are present.
 *
 * This is strictly test-only, requires explicit opt-in via
 * E2E_USE_TEST_AUTH_BYPASS, and is only honored for loopback requests.
 */
export function resolveTestBypassUserId(
  headerReader: HeaderReader,
  cookieReader?: CookieReader
): string | null {
  if (!isTestAuthBypassEnabled()) {
    return null;
  }
  const headerMode = normalizeHeaderValue(headerReader.get(TEST_MODE_HEADER));
  const cookieMode = normalizeHeaderValue(
    cookieReader?.get(TEST_MODE_COOKIE)?.value ??
      getCookieValueFromHeader(headerReader, TEST_MODE_COOKIE)
  );
  const mode = headerMode ?? cookieMode;
  if (mode !== TEST_AUTH_BYPASS_MODE) {
    return null;
  }

  if (!isTrustedTestBypassRequest(headerReader)) {
    return null;
  }

  return (
    normalizeHeaderValue(headerReader.get(TEST_USER_ID_HEADER)) ??
    normalizeHeaderValue(
      cookieReader?.get(TEST_USER_ID_COOKIE)?.value ??
        getCookieValueFromHeader(headerReader, TEST_USER_ID_COOKIE)
    ) ??
    normalizeHeaderValue(
      process.env.E2E_CLERK_USER_ID ?? process.env.TEST_CLERK_USER_ID ?? null
    ) ??
    'user_test'
  );
}
