/**
 * Contact Limit Entitlement Tests
 *
 * Tests the contact limit enforcement logic that depends on entitlements.
 * Verifies that the limit values from entitlements are correct for each plan
 * and that the enforcement contract (null = unlimited, number = limit) is sound.
 */
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUserEntitlements } from '@/lib/entitlements/server';

const { mockCachedAuth, mockCachedCurrentUser } = vi.hoisted(() => ({
  mockCachedAuth: vi.fn(),
  mockCachedCurrentUser: vi.fn(),
}));

const { mockGetUserBillingInfo } = vi.hoisted(() => ({
  mockGetUserBillingInfo: vi.fn(),
}));

const { mockIsAdmin } = vi.hoisted(() => ({
  mockIsAdmin: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockCachedAuth,
  getCachedCurrentUser: mockCachedCurrentUser,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: mockGetUserBillingInfo,
}));

vi.mock('@/lib/admin/roles', () => ({
  isAdmin: mockIsAdmin,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

/** Set up an authenticated user with given plan */
function setupUser(plan: string, isPro: boolean) {
  mockCachedAuth.mockResolvedValue({ userId: `user_${plan}` });
  mockCachedCurrentUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: `${plan}@example.com` },
  });
  mockIsAdmin.mockResolvedValue(false);
  mockGetUserBillingInfo.mockResolvedValue({
    success: true,
    data: {
      userId: 'db_id',
      email: `${plan}@example.com`,
      isAdmin: false,
      isPro,
      plan,
      stripeCustomerId: isPro ? `cus_${plan}` : null,
      stripeSubscriptionId: isPro ? `sub_${plan}` : null,
    },
  });
}

describe('Contact Limit Enforcement Contract', () => {
  it('free plan returns a numeric limit that blocks new contacts at 100', async () => {
    setupUser('free', false);
    const e = await getCurrentUserEntitlements();

    // The contact actions code uses this check:
    // if (contactsLimit !== null && contactsLimit !== undefined) { enforce limit }
    expect(e.contactsLimit).toBe(100);
    expect(typeof e.contactsLimit).toBe('number');

    // Simulate the enforcement: total >= contactsLimit
    const totalContacts = 100;
    expect(totalContacts >= e.contactsLimit!).toBe(true);
  });

  it('free plan allows contacts under the limit', async () => {
    setupUser('free', false);
    const e = await getCurrentUserEntitlements();

    const totalContacts = 99;
    expect(totalContacts >= e.contactsLimit!).toBe(false);
  });

  it('pro plan returns null limit that bypasses enforcement', async () => {
    setupUser('pro', true);
    const e = await getCurrentUserEntitlements();

    // null contactsLimit means the enforcement check is skipped entirely:
    // if (contactsLimit !== null && contactsLimit !== undefined) → false, no limit check
    expect(e.contactsLimit).toBeNull();

    // Simulate the enforcement check
    const contactsLimit = e.contactsLimit;
    const shouldEnforce = contactsLimit !== null && contactsLimit !== undefined;
    expect(shouldEnforce).toBe(false);
  });

  it('growth plan returns null limit that bypasses enforcement', async () => {
    setupUser('growth', true);
    const e = await getCurrentUserEntitlements();

    expect(e.contactsLimit).toBeNull();
    const shouldEnforce =
      e.contactsLimit !== null && e.contactsLimit !== undefined;
    expect(shouldEnforce).toBe(false);
  });

  it('new user (null billing data) gets the free contact limit', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_new' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'new@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: null, // user not in billing DB yet
    });

    const e = await getCurrentUserEntitlements();

    expect(e.contactsLimit).toBe(100);
  });

  it('billing failure allows contact creation (graceful degradation)', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_fail' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'fail@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'timeout',
    });

    // The contact actions code catches this and sets entitlements=null
    // Then: contactsLimit = entitlements?.contactsLimit → undefined
    // Then: if (contactsLimit !== null && contactsLimit !== undefined) → false
    // Result: no limit enforcement (graceful degradation)
    let entitlements;
    try {
      entitlements = await getCurrentUserEntitlements();
    } catch {
      entitlements = null;
    }

    const contactsLimit = entitlements?.contactsLimit;
    const shouldEnforce = contactsLimit !== null && contactsLimit !== undefined;
    expect(shouldEnforce).toBe(false);
  });

  it('unauthenticated user gets the free contact limit', async () => {
    mockCachedAuth.mockResolvedValue({ userId: null });
    mockCachedCurrentUser.mockResolvedValue(null);

    const e = await getCurrentUserEntitlements();
    expect(e.contactsLimit).toBe(100);
  });
});

describe('Contact Limit – Plan Transitions', () => {
  it('downgrade from pro to free restores the 100 contact limit', async () => {
    // User was pro but subscription ended
    setupUser('free', false);
    const e = await getCurrentUserEntitlements();

    expect(e.contactsLimit).toBe(100);
    expect(e.isPro).toBe(false);
  });

  it('upgrade from free to pro removes contact limit', async () => {
    setupUser('pro', true);
    const e = await getCurrentUserEntitlements();

    expect(e.contactsLimit).toBeNull();
    expect(e.isPro).toBe(true);
  });

  it('upgrade from pro to growth keeps unlimited contacts', async () => {
    setupUser('growth', true);
    const e = await getCurrentUserEntitlements();

    expect(e.contactsLimit).toBeNull();
    expect(e.isPro).toBe(true);
    expect(e.hasAdvancedFeatures).toBe(true);
  });
});
