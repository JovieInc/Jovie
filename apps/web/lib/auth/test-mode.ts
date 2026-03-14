export const TEST_MODE_HEADER = 'x-test-mode';
export const TEST_USER_ID_HEADER = 'x-test-user-id';
export const TEST_AUTH_BYPASS_MODE = 'bypass-auth';

interface HeaderReader {
  get(name: string): string | null;
}

function normalizeHeaderValue(value: string | null): string | null {
  return value?.trim() || null;
}

/**
 * Returns a mocked auth userId when test bypass headers are present.
 *
 * This is strictly test-only and gated by NODE_ENV=test at call-sites.
 */
export function resolveTestBypassUserId(
  headerReader: HeaderReader
): string | null {
  const mode = normalizeHeaderValue(headerReader.get(TEST_MODE_HEADER));
  if (mode !== TEST_AUTH_BYPASS_MODE) {
    return null;
  }

  return (
    normalizeHeaderValue(headerReader.get(TEST_USER_ID_HEADER)) ??
    normalizeHeaderValue(process.env.TEST_CLERK_USER_ID ?? null) ??
    'user_test'
  );
}
