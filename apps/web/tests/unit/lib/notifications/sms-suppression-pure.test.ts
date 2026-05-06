/**
 * Pure-logic tests for sms-suppression: normalizePhoneE164 + hashPhoneE164.
 *
 * The DB-bound functions (isPhoneSmsSuppressed, suppressPhoneForStop,
 * reactivatePhoneAfterVerifiedOptIn) are tested at the integration layer.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema/analytics', () => ({
  notificationSubscriptions: {},
}));
vi.mock('@/lib/db/schema/notifications', () => ({
  notificationContacts: {},
}));

beforeAll(() => {
  process.env.SMS_INTENT_SECRET ??= 'test-sms-intent-secret-32-chars!';
});

describe('normalizePhoneE164', () => {
  it.each([
    ['+1 (555) 555-0100', '+15555550100'],
    ['+1-555-555-0100', '+15555550100'],
    ['+15555550100', '+15555550100'],
    ['(555) 555-0100', '+5555550100'],
    ['00 1 555 555 0100', '+15555550100'],
  ])('normalizes %s to %s', async (input, expected) => {
    const { normalizePhoneE164 } = await import(
      '@/lib/notifications/sms-suppression'
    );
    expect(normalizePhoneE164(input)).toBe(expected);
  });

  it('returns null for invalid inputs', async () => {
    const { normalizePhoneE164 } = await import(
      '@/lib/notifications/sms-suppression'
    );
    expect(normalizePhoneE164('')).toBeNull();
    expect(normalizePhoneE164('not a phone')).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164(undefined)).toBeNull();
    // Too short — only 5 digits.
    expect(normalizePhoneE164('+12345')).toBeNull();
  });
});

describe('hashPhoneE164', () => {
  it('produces the same hash for equivalent representations', async () => {
    const { hashPhoneE164 } = await import(
      '@/lib/notifications/sms-suppression'
    );
    const a = hashPhoneE164('+15555550100');
    const b = hashPhoneE164('+1 (555) 555-0100');
    const c = hashPhoneE164('+1-555-555-0100');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('produces 64 hex chars', async () => {
    const { hashPhoneE164 } = await import(
      '@/lib/notifications/sms-suppression'
    );
    expect(hashPhoneE164('+15555550100')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('throws for unnormalizable input', async () => {
    const { hashPhoneE164 } = await import(
      '@/lib/notifications/sms-suppression'
    );
    expect(() => hashPhoneE164('not a phone')).toThrow();
  });
});

describe('tryHashPhoneE164', () => {
  it('returns null instead of throwing for invalid input', async () => {
    const { tryHashPhoneE164 } = await import(
      '@/lib/notifications/sms-suppression'
    );
    expect(tryHashPhoneE164('not a phone')).toBeNull();
    expect(tryHashPhoneE164(null)).toBeNull();
  });

  it('returns the same hash as hashPhoneE164 for valid input', async () => {
    const { tryHashPhoneE164, hashPhoneE164 } = await import(
      '@/lib/notifications/sms-suppression'
    );
    expect(tryHashPhoneE164('+15555550100')).toBe(
      hashPhoneE164('+15555550100')
    );
  });
});
