// Mock for @/lib/auth/test-mode in Storybook.
// The real module imports node:net (isIPv4) at module scope, which vite
// externalizes for the browser. Constants re-export is browser-safe.

export {
  TEST_AUTH_BYPASS_MODE,
  TEST_MODE_COOKIE,
  TEST_MODE_HEADER,
  TEST_PERSONA_COOKIE,
  TEST_USER_ID_COOKIE,
  TEST_USER_ID_HEADER,
} from '../lib/auth/test-mode-constants';

export function isTestAuthBypassEnabled(): boolean {
  return false;
}

export function isTrustedTestBypassHostname(_hostname: string | null): boolean {
  return false;
}

export function isTrustedTestBypassRequest(): boolean {
  return false;
}

export function resolveTestBypassUserId(): string | null {
  return null;
}
