import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { DevTestAuthPersona } from '@/lib/auth/dev-test-auth-types';
import { normalizeEmail } from '@/lib/utils/email';

export const DEFAULT_DEV_TEST_AUTH_EMAILS = {
  admin: 'browse-admin+clerk_test@jov.ie',
  creator: 'browse+clerk_test@jov.ie',
  'creator-ready': 'browse-ready+clerk_test@jov.ie',
} as const satisfies Record<DevTestAuthPersona, string>;

export function getDeterministicTestBetterAuthUserId(email: string): string {
  const normalizedEmail = normalizeEmail(email);
  const bytes = sha256(
    new TextEncoder().encode(`jovie:better-auth-test-user:${normalizedEmail}`)
  ).slice(0, 16);

  // RFC 9562 UUIDv8 reserves the payload for application-defined,
  // deterministic data. PostgreSQL accepts it as a native UUID while the
  // fixed version and variant bits keep the generated identifier canonical.
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getDeterministicDevTestAuthPersonaUserId(
  persona: DevTestAuthPersona,
  adminEmail = DEFAULT_DEV_TEST_AUTH_EMAILS.admin
): string {
  const email =
    persona === 'admin' ? adminEmail : DEFAULT_DEV_TEST_AUTH_EMAILS[persona];
  return getDeterministicTestBetterAuthUserId(email);
}
