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

describe('getCurrentUserEntitlements', () => {
  it('returns unauthenticated entitlements when not authenticated', async () => {
    mockCachedAuth.mockResolvedValue({ userId: null });
    mockCachedCurrentUser.mockResolvedValue(null);

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: null,
      email: null,
      isAuthenticated: false,
      isAdmin: false,
      plan: 'free',
      isPro: false,
      hasAdvancedFeatures: false,
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      canExportContacts: false,
      canAccessAdvancedAnalytics: false,
      canFilterSelfFromAnalytics: false,
      canAccessAdPixels: false,
      canAccessInbox: false,
      canBeVerified: false,
      aiCanUseTools: true,
      canCreateManualReleases: true,
      canAccessTasksWorkspace: false,
      canGenerateReleasePlans: false,
      canGenerateAlbumArt: false,
      canAccessMetadataSubmissionAgent: false,
      canAccessFutureReleases: false,
      canSendNotifications: false,
      canEditSmartLinks: true,
      analyticsRetentionDays: 30,
      contactsLimit: 100,
      smartLinksLimit: null,
      aiDailyMessageLimit: 10,
      canAccessPreSave: false,
      canAccessTipping: false,
      canAccessUrlEncryption: false,
      canAccessStripeConnect: false,
      canAccessFanSubscriptions: false,
      canAccessEmailCampaigns: false,
      canAccessApiKeys: false,
      canAccessTeamManagement: false,
      canAccessWebhooks: false,
      canAccessWhiteLabel: false,
      canAccessAbTesting: false,
      aiPitchGenPerRelease: 1,
    });
  });

  it('degrades to free tier when billing lookup fails', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_123' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'user@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'database connection failed',
    });

    const e = await getCurrentUserEntitlements();
    expect(e.plan).toBe('free');
    expect(e.isPro).toBe(false);
    expect(e.isAuthenticated).toBe(true);
    expect(e.userId).toBe('user_123');
  });

  it('billing failure preserves admin status in degraded result', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_admin' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'admin@example.com' },
    });
    mockIsAdmin.mockResolvedValue(true);
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'timeout',
    });

    const e = await getCurrentUserEntitlements();
    expect(e.isAdmin).toBe(true);
    expect(e.isAuthenticated).toBe(true);
    expect(e.plan).toBe('free');
    expect(e.userId).toBe('user_admin');
  });

  it('returns free entitlements when billing data is null (new user)', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_new' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'new@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: null,
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements.userId).toBe('user_new');
    expect(entitlements.isAuthenticated).toBe(true);
    expect(entitlements.plan).toBe('free');
    expect(entitlements.isPro).toBe(false);
    expect(entitlements.contactsLimit).toBe(100);
    expect(entitlements.analyticsRetentionDays).toBe(30);
  });

  it('returns free entitlements when billing lookup reports user not found', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_new_missing_row' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'newmissing@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      error: 'User not found',
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements.userId).toBe('user_new_missing_row');
    expect(entitlements.isAuthenticated).toBe(true);
    expect(entitlements.email).toBe('newmissing@example.com');
    expect(entitlements.plan).toBe('free');
    expect(entitlements.isPro).toBe(false);
    expect(entitlements.contactsLimit).toBe(100);
    expect(entitlements.analyticsRetentionDays).toBe(30);
  });

  it('maps billing data for a free user', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_free' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'free@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'free@example.com',
        isAdmin: false,
        isPro: false,
        plan: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: 'user_free',
      email: 'free@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan: 'free',
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      isPro: false,
      hasAdvancedFeatures: false,
      canExportContacts: false,
      canAccessAdvancedAnalytics: false,
      canFilterSelfFromAnalytics: false,
      canAccessAdPixels: false,
      canAccessInbox: false,
      canBeVerified: false,
      aiCanUseTools: true,
      canCreateManualReleases: true,
      canAccessTasksWorkspace: false,
      canGenerateReleasePlans: false,
      canGenerateAlbumArt: false,
      canAccessMetadataSubmissionAgent: false,
      canAccessFutureReleases: false,
      canSendNotifications: false,
      canEditSmartLinks: true,
      analyticsRetentionDays: 30,
      contactsLimit: 100,
      smartLinksLimit: null,
      aiDailyMessageLimit: 10,
      canAccessPreSave: false,
      canAccessTipping: false,
      canAccessUrlEncryption: false,
      canAccessStripeConnect: false,
      canAccessFanSubscriptions: false,
      canAccessEmailCampaigns: false,
      canAccessApiKeys: false,
      canAccessTeamManagement: false,
      canAccessWebhooks: false,
      canAccessWhiteLabel: false,
      canAccessAbTesting: false,
      aiPitchGenPerRelease: 1,
    });
  });

  it('maps billing data for a pro user', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_pro' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'pro@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'pro@example.com',
        isAdmin: false,
        isPro: true,
        plan: 'pro',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: 'user_pro',
      email: 'pro@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan: 'pro',
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      isPro: true,
      hasAdvancedFeatures: false,
      canExportContacts: true,
      canAccessAdvancedAnalytics: true,
      canFilterSelfFromAnalytics: true,
      canAccessAdPixels: true,
      canAccessInbox: true,
      canBeVerified: true,
      aiCanUseTools: true,
      canCreateManualReleases: true,
      canAccessTasksWorkspace: true,
      canGenerateReleasePlans: false,
      canGenerateAlbumArt: true,
      canAccessMetadataSubmissionAgent: false,
      canAccessFutureReleases: true,
      canSendNotifications: true,
      canEditSmartLinks: true,
      canAccessPreSave: true,
      canAccessTipping: true,
      canAccessUrlEncryption: true,
      canAccessStripeConnect: false,
      canAccessFanSubscriptions: false,
      canAccessEmailCampaigns: false,
      canAccessApiKeys: false,
      canAccessTeamManagement: false,
      canAccessWebhooks: false,
      canAccessWhiteLabel: false,
      canAccessAbTesting: false,
      analyticsRetentionDays: 180,
      contactsLimit: null,
      smartLinksLimit: null,
      aiDailyMessageLimit: 100,
      aiPitchGenPerRelease: 5,
    });
  });

  it('maps billing data for a max user (backward compat: DB may store growth)', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_growth' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'growth@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'growth@example.com',
        isAdmin: false,
        isPro: true,
        plan: 'growth',
        stripeCustomerId: 'cus_456',
        stripeSubscriptionId: 'sub_456',
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements).toEqual({
      userId: 'user_growth',
      email: 'growth@example.com',
      isAuthenticated: true,
      isAdmin: false,
      plan: 'growth',
      isTrialing: false,
      trialEndsAt: null,
      trialDaysRemaining: null,
      isPro: true,
      hasAdvancedFeatures: true,
      canExportContacts: true,
      canAccessAdvancedAnalytics: true,
      canFilterSelfFromAnalytics: true,
      canAccessAdPixels: true,
      canAccessInbox: true,
      canBeVerified: true,
      aiCanUseTools: true,
      canCreateManualReleases: true,
      canAccessTasksWorkspace: true,
      canGenerateReleasePlans: true,
      canGenerateAlbumArt: true,
      canAccessMetadataSubmissionAgent: true,
      canAccessFutureReleases: true,
      canSendNotifications: true,
      canEditSmartLinks: true,
      canAccessPreSave: true,
      canAccessTipping: true,
      canAccessUrlEncryption: true,
      canAccessStripeConnect: true,
      canAccessFanSubscriptions: true,
      canAccessEmailCampaigns: true,
      canAccessApiKeys: true,
      canAccessTeamManagement: true,
      canAccessWebhooks: true,
      canAccessWhiteLabel: true,
      canAccessAbTesting: true,
      analyticsRetentionDays: null,
      contactsLimit: null,
      smartLinksLimit: null,
      aiDailyMessageLimit: 500,
      aiPitchGenPerRelease: null,
    });
  });

  it('admin status is fetched independently of billing', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_admin' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'admin@example.com' },
    });
    mockIsAdmin.mockResolvedValue(true);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'admin@example.com',
        isAdmin: false, // DB says not admin, but role check says yes
        isPro: false,
        plan: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    // isAdmin comes from the role check (Redis), not from billing DB
    expect(entitlements.isAdmin).toBe(true);
  });

  it('defaults to pro plan when isPro=true but dbPlan is null', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_noPlan' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'noplan@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'noplan@example.com',
        isAdmin: false,
        isPro: true,
        plan: null, // plan not set in DB
        stripeCustomerId: 'cus_789',
        stripeSubscriptionId: 'sub_789',
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements.plan).toBe('pro');
    expect(entitlements.isPro).toBe(true);
    expect(entitlements.canExportContacts).toBe(true);
    expect(entitlements.analyticsRetentionDays).toBe(180);
    expect(entitlements.contactsLimit).toBeNull();
  });

  it('defaults to pro plan when isPro=true but dbPlan is empty string', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_emptyPlan' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'empty@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'empty@example.com',
        isAdmin: false,
        isPro: true,
        plan: '', // empty string in DB
        stripeCustomerId: 'cus_999',
        stripeSubscriptionId: 'sub_999',
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    // Empty string is falsy, so (dbPlan as UserPlan) || 'pro' → 'pro'
    expect(entitlements.plan).toBe('pro');
    expect(entitlements.isPro).toBe(true);
  });

  it('forces free entitlements when isPro=false even if dbPlan says pro', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_mismatch' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'mismatch@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'mismatch@example.com',
        isAdmin: false,
        isPro: false, // subscription is not active
        plan: 'pro', // stale plan in DB
        stripeCustomerId: 'cus_stale',
        stripeSubscriptionId: 'sub_stale',
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    // isPro is the gate — plan string alone does not grant features
    expect(entitlements.plan).toBe('free');
    expect(entitlements.isPro).toBe(false);
    expect(entitlements.canExportContacts).toBe(false);
    expect(entitlements.contactsLimit).toBe(100);
    expect(entitlements.analyticsRetentionDays).toBe(30);
  });

  it('forces free entitlements when isPro=false even if dbPlan says growth', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_mismatch2' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'mismatch2@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'mismatch2@example.com',
        isAdmin: false,
        isPro: false, // subscription cancelled
        plan: 'growth', // stale growth plan
        stripeCustomerId: 'cus_old',
        stripeSubscriptionId: null,
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements.plan).toBe('free');
    expect(entitlements.isPro).toBe(false);
    expect(entitlements.hasAdvancedFeatures).toBe(false);
    expect(entitlements.canAccessAdvancedAnalytics).toBe(false);
    expect(entitlements.contactsLimit).toBe(100);
  });

  it('admin who is also a pro subscriber gets both flags', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_admin_pro' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'adminpro@example.com' },
    });
    mockIsAdmin.mockResolvedValue(true);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'adminpro@example.com',
        isAdmin: true,
        isPro: true,
        plan: 'growth',
        stripeCustomerId: 'cus_adminpro',
        stripeSubscriptionId: 'sub_adminpro',
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements.isAdmin).toBe(true);
    expect(entitlements.isPro).toBe(true);
    expect(entitlements.plan).toBe('growth');
    expect(entitlements.hasAdvancedFeatures).toBe(true);
    expect(entitlements.contactsLimit).toBeNull();
  });

  it('falls back to Clerk email when billing email is empty', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_noDbEmail' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'clerk@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: '', // empty string in DB
        isAdmin: false,
        isPro: false,
        plan: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    // effectiveEmail = emailFromDb || clerkEmail → '' || 'clerk@example.com'
    expect(entitlements.email).toBe('clerk@example.com');
  });

  it('prefers billing email over Clerk email when both exist', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_bothEmails' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'clerk@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'billing@example.com',
        isAdmin: false,
        isPro: true,
        plan: 'pro',
        stripeCustomerId: 'cus_both',
        stripeSubscriptionId: 'sub_both',
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    expect(entitlements.email).toBe('billing@example.com');
  });

  it('continues with null email when Clerk identity resolution throws', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_clerkFail' });
    mockCachedCurrentUser.mockRejectedValue(new Error('Clerk unavailable'));
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: true,
      data: {
        userId: 'db_user_id',
        email: 'db@example.com',
        isAdmin: false,
        isPro: false,
        plan: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    });

    const entitlements = await getCurrentUserEntitlements();

    // Should not throw — Clerk failure is caught
    expect(entitlements.isAuthenticated).toBe(true);
    // Falls back to DB email since Clerk email is null
    expect(entitlements.email).toBe('db@example.com');
  });

  it('billing failure without error field degrades to free tier', async () => {
    mockCachedAuth.mockResolvedValue({ userId: 'user_noCause' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'nocause@example.com' },
    });
    mockIsAdmin.mockResolvedValue(false);
    mockGetUserBillingInfo.mockResolvedValue({
      success: false,
      // no error field
    });

    const e = await getCurrentUserEntitlements();
    expect(e.plan).toBe('free');
    expect(e.isPro).toBe(false);
    expect(e.isAuthenticated).toBe(true);
    expect(e.userId).toBe('user_noCause');
  });

  it('fetches admin and billing concurrently (not sequentially)', async () => {
    const callOrder: string[] = [];

    mockCachedAuth.mockResolvedValue({ userId: 'user_concurrent' });
    mockCachedCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'concurrent@example.com' },
    });
    mockIsAdmin.mockImplementation(async () => {
      callOrder.push('admin_start');
      await new Promise(r => setTimeout(r, 1));
      callOrder.push('admin_end');
      return false;
    });
    mockGetUserBillingInfo.mockImplementation(async () => {
      callOrder.push('billing_start');
      await new Promise(r => setTimeout(r, 1));
      callOrder.push('billing_end');
      return {
        success: true,
        data: {
          userId: 'db_id',
          email: 'concurrent@example.com',
          isAdmin: false,
          isPro: false,
          plan: 'free',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        },
      };
    });

    await getCurrentUserEntitlements();

    // Both should start before either finishes (Promise.all)
    expect(callOrder.indexOf('admin_start')).toBeLessThan(
      callOrder.indexOf('admin_end')
    );
    expect(callOrder.indexOf('billing_start')).toBeLessThan(
      callOrder.indexOf('billing_end')
    );
    // Both start calls should happen before any end call
    const firstEnd = Math.min(
      callOrder.indexOf('admin_end'),
      callOrder.indexOf('billing_end')
    );
    expect(callOrder.indexOf('admin_start')).toBeLessThan(firstEnd);
    expect(callOrder.indexOf('billing_start')).toBeLessThan(firstEnd);
  });
});
