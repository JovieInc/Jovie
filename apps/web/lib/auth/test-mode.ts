import { isIPv4 } from 'node:net';
import {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_MODE_HEADER,
  TEST_USER_ID_COOKIE,
  TEST_USER_ID_HEADER,
} from '@/lib/auth/test-mode-constants';

export {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_MODE_HEADER,
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
  TEST_USER_ID_HEADER,
} from '@/lib/auth/test-mode-constants';

const TRUSTED_PREVIEW_HOSTS = new Set(['preview.jov.ie']);

const PRIVATE_IPV4_BLOCKS = [
  /^10\./,
  /^127\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
] as const;

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

function isPrivateIpv4Literal(hostname: string | null): boolean {
  if (!hostname || !isIPv4(hostname)) {
    return false;
  }

  return PRIVATE_IPV4_BLOCKS.some(pattern => pattern.test(hostname));
}

export function isLocalTestBypassHostname(hostname: string | null): boolean {
  const normalizedHostname = hostname?.trim().toLowerCase() ?? null;

  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '0.0.0.0' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]' ||
    Boolean(normalizedHostname?.endsWith('.localhost')) ||
    Boolean(normalizedHostname?.endsWith('.local')) ||
    isPrivateIpv4Literal(normalizedHostname)
  );
}

export function isTrustedTestBypassHostname(hostname: string | null): boolean {
  const normalizedHostname = hostname?.trim().toLowerCase() ?? null;

  return (
    isLocalTestBypassHostname(normalizedHostname) ||
    Boolean(normalizedHostname?.endsWith('.vercel.app')) ||
    Boolean(normalizedHostname && TRUSTED_PREVIEW_HOSTS.has(normalizedHostname))
  );
}

export function isTrustedTestBypassRequest(
  headerReader: HeaderReader
): boolean {
  const hostname =
    extractHostname(headerReader.get('x-forwarded-host')) ??
    extractHostname(headerReader.get('host')) ??
    extractHostname(headerReader.get('origin')) ??
    extractHostname(headerReader.get('referer'));

  return isTrustedTestBypassHostname(hostname);
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
