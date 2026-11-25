/** Shared Playwright gates for real DB + Better Auth E2E lanes. */

const REQUIRED_ENV = {
  DATABASE_URL: process.env.DATABASE_URL,
} as const;

function hasRealEnv(): boolean {
  return Object.values(REQUIRED_ENV).every(
    v => v && !v.includes('mock') && !v.includes('dummy')
  );
}

/** DB + non-mocked auth + an E2E lane that can mint a real session. */
export function hasRealAuthE2eEnv(): boolean {
  if (!hasRealEnv()) return false;
  if (
    process.env.NEXT_PUBLIC_AUTH_MOCK === '1' ||
    process.env.NEXT_PUBLIC_AUTH_PROXY_DISABLED === '1'
  ) {
    return false;
  }
  if (
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' ||
    process.env.E2E_USE_STORED_AUTH === '1' ||
    process.env.E2E_TEST_MODE === '1'
  ) {
    return true;
  }
  return false;
}
