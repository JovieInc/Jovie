import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';

const baseContext = {
  displayName: 'The Artist',
  username: 'theartist',
  bio: 'Independent alt-pop artist',
  genres: ['alt-pop'],
  spotifyFollowers: 12345,
  spotifyPopularity: 57,
  profileViews: 876,
  hasSocialLinks: true,
  hasMusicLinks: true,
  tippingStats: {
    tipClicks: 10,
    tipsSubmitted: 2,
    totalReceivedCents: 1200,
    monthReceivedCents: 500,
  },
};

describe('buildSystemPrompt', () => {
  it('includes release count and release lines in discography context', () => {
    const prompt = buildSystemPrompt(baseContext, [
      {
        title: 'Midnight Signal',
        releaseType: 'single',
        releaseDate: '2025-06-01T00:00:00.000Z',
        totalTracks: 1,
      },
      {
        title: 'Color Theory',
        releaseType: 'ep',
        releaseDate: null,
        totalTracks: 5,
      },
    ]);

    expect(prompt).toContain('## Discography Context');
    expect(prompt).toContain('- **Total Releases:** 2');
    expect(prompt).toContain('- Midnight Signal (single, 2025-06-01, 1 track)');
    expect(prompt).toContain('- Color Theory (ep, 5 tracks)');
  });

  it('shows fallback line when no releases are available', () => {
    const prompt = buildSystemPrompt(baseContext, []);

    expect(prompt).toContain('- **Total Releases:** 0');
    expect(prompt).toContain(
      '- No releases found in the connected discography yet.'
    );
  });

  it('includes the analytics tool guidance when insights are enabled', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiDailyMessageLimit: 10,
      insightsEnabled: true,
    });

    expect(prompt).toContain("call the 'showTopInsights' tool first");
  });

  it('does not instruct the model to call analytics tools when insights are disabled', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiDailyMessageLimit: 10,
      insightsEnabled: false,
    });

    expect(prompt).not.toContain("call the 'showTopInsights' tool first");
    expect(prompt).toContain(
      'you do not have access to insight cards in this session'
    );
  });

  it('injects verified account context without exposing Stripe identifiers', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: true,
      aiDailyMessageLimit: 100,
      accountContext: {
        email: 'tim@jov.ie',
        plan: 'pro',
        displayPlan: 'Pro',
        isPro: true,
        billingVerification: 'verified',
        planMismatch: {
          rawPlan: 'free',
          normalizedPlan: 'pro',
          reason: 'is_pro_true_with_non_paid_plan',
        },
        usage: {
          dailyLimit: 100,
          used: 7,
          remaining: 93,
          resetAt: '2026-05-24T07:00:00.000Z',
          monthlyLimit: 3100,
          monthlyUsed: 7,
          monthlyRemaining: 3093,
          monthlyResetAt: '2026-06-01T00:00:00.000Z',
        },
        entitlements: {
          aiCanUseTools: true,
          canAccessMerchCreation: true,
          canGenerateAlbumArt: true,
          canAccessAdvancedAnalytics: true,
        },
        flags: { merchMvp: true },
        billing: {
          hasStripeCustomer: true,
          hasStripeSubscription: true,
        },
      },
    });

    expect(prompt).toContain('## Account & Access');
    expect(prompt).toContain('- **Account Email:** tim@jov.ie');
    expect(prompt).toContain('- **Plan:** Pro');
    expect(prompt).toContain('- **Merch Creation:** Available');
    expect(prompt).toContain(
      '- **AI Usage Today:** 7 used, 93 remaining of 100'
    );
    expect(prompt).toContain('Billing row mismatch detected');
    expect(prompt).not.toContain('cus_');
    expect(prompt).not.toContain('sub_');
  });

  it('does not show Free-plan limitations when billing verification is unavailable', () => {
    const prompt = buildSystemPrompt(baseContext, [], {
      aiCanUseTools: false,
      aiDailyMessageLimit: 10,
      accountContext: {
        email: 'tim@jov.ie',
        plan: 'free',
        displayPlan: 'Unverified',
        isPro: false,
        billingVerification: 'unavailable',
        planMismatch: null,
        usage: null,
        entitlements: {
          aiCanUseTools: false,
          canAccessMerchCreation: false,
          canGenerateAlbumArt: false,
          canAccessAdvancedAnalytics: false,
        },
        flags: { merchMvp: true },
        billing: {
          hasStripeCustomer: false,
          hasStripeSubscription: false,
        },
      },
    });

    expect(prompt).toContain('Billing verification is temporarily unavailable');
    expect(prompt).not.toContain('This artist is on the Free plan');
  });
});
