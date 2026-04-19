import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { resolveProfileMonetizationSummary } from '@/lib/profile-monetization';

describe('resolveProfileMonetizationSummary', () => {
  it('resolves needs_profile_url when no username is set', () => {
    const summary = resolveProfileMonetizationSummary({
      username: null,
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: false,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    expect(summary.paymentState).toBe('needs_profile_url');
    expect(summary.provider).toBe('none');
    expect(summary.manageHref).toBe(APP_ROUTES.SETTINGS_ARTIST_PROFILE);
    expect(summary.tipUrl).toBeNull();
  });

  it('resolves not_setup when a profile URL exists but payouts are not configured', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: false,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    expect(summary.paymentState).toBe('not_setup');
    expect(summary.provider).toBe('none');
    expect(summary.tipUrl).toBeNull();
  });

  it('resolves setup_incomplete when Stripe is connected but payouts are not ready', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: true,
      stripeAccountId: 'acct_123',
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: false,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    expect(summary.paymentState).toBe('setup_incomplete');
    expect(summary.provider).toBe('stripe');
    expect(summary.manageHref).toBe(APP_ROUTES.SETTINGS_PAYMENTS);
  });

  it('resolves ready_no_activity when tips are live but no traffic exists yet', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: true,
      hasVenmoLink: false,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    expect(summary.paymentState).toBe('ready_no_activity');
    expect(summary.provider).toBe('venmo');
    expect(summary.tipUrl).toContain('/artist/pay');
  });

  it('resolves traffic_no_tips when fans visit but have not tipped yet', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: false,
      hasVenmoLink: true,
      tipVisits: 42,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    expect(summary.paymentState).toBe('traffic_no_tips');
    expect(summary.provider).toBe('venmo');
    expect(summary.narrative).toContain('42 fans opened');
  });

  it('resolves active when tips have been received', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: false,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: true,
      hasVenmoLink: false,
      tipVisits: 12,
      tipsReceived: 3,
      totalReceivedCents: 23500,
      monthReceivedCents: 12000,
    });

    expect(summary.paymentState).toBe('active');
    expect(summary.provider).toBe('venmo');
    expect(summary.narrative).toContain('$235');
  });

  it('prioritizes active Stripe over Venmo fallback', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: true,
      stripeAccountId: 'acct_123',
      stripeOnboardingComplete: true,
      stripePayoutsEnabled: true,
      hasVenmoHandle: true,
      hasVenmoLink: true,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    expect(summary.paymentState).toBe('ready_no_activity');
    expect(summary.provider).toBe('stripe');
  });

  it('prioritizes incomplete Stripe over Venmo fallback', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: true,
      stripeAccountId: 'acct_123',
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: true,
      hasVenmoLink: true,
      tipVisits: 10,
      tipsReceived: 2,
      totalReceivedCents: 5000,
      monthReceivedCents: 5000,
    });

    expect(summary.paymentState).toBe('setup_incomplete');
    expect(summary.provider).toBe('stripe');
  });

  it('falls back to Venmo before none when Stripe is unavailable', () => {
    const summary = resolveProfileMonetizationSummary({
      username: 'artist',
      stripeConnectEnabled: true,
      stripeAccountId: null,
      stripeOnboardingComplete: false,
      stripePayoutsEnabled: false,
      hasVenmoHandle: false,
      hasVenmoLink: true,
      tipVisits: 0,
      tipsReceived: 0,
      totalReceivedCents: 0,
      monthReceivedCents: 0,
    });

    expect(summary.paymentState).toBe('ready_no_activity');
    expect(summary.provider).toBe('venmo');
  });
});
