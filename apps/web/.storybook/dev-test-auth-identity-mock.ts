import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';

export const DEFAULT_DEV_TEST_AUTH_EMAILS = {
  admin: 'browse-admin+clerk_test@jov.ie',
  creator: 'browse+clerk_test@jov.ie',
  'creator-ready': 'browse-ready+clerk_test@jov.ie',
} as const satisfies Record<DevTestAuthPersona, string>;

const STORYBOOK_USER_IDS = {
  admin: '00000000-0000-4000-8000-000000000101',
  creator: '00000000-0000-4000-8000-000000000102',
  'creator-ready': '00000000-0000-4000-8000-000000000103',
} as const satisfies Record<DevTestAuthPersona, string>;

export function getDeterministicTestBetterAuthUserId(): string {
  return STORYBOOK_USER_IDS.creator;
}

export function getDeterministicDevTestAuthPersonaUserId(
  persona: DevTestAuthPersona
): string {
  return STORYBOOK_USER_IDS[persona];
}
