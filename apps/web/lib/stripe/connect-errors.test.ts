import { afterEach, describe, expect, it } from 'vitest';
import {
  blockStripeConnectPlatformProfile,
  classifyStripeConnectOnboardError,
  clearStripeConnectPlatformProfileBlock,
  isStripeConnectPlatformProfileBlocked,
  isStripeConnectPlatformProfileIncompleteError,
  STRIPE_CONNECT_PLATFORM_PROFILE_INCOMPLETE_ERROR,
} from './connect-errors';

const PLATFORM_PROFILE_STRIPE_ERROR = {
  type: 'StripeInvalidRequestError',
  message:
    'You must complete your platform profile to use Connect and create live connected accounts. Visit your dashboard at https://dashboard.stripe.com/connect/accounts/overview to answer the questionnaire.',
};

describe('isStripeConnectPlatformProfileIncompleteError', () => {
  it('detects Stripe platform profile questionnaire errors', () => {
    expect(
      isStripeConnectPlatformProfileIncompleteError(
        PLATFORM_PROFILE_STRIPE_ERROR
      )
    ).toBe(true);
  });

  it('returns false for unrelated Stripe failures', () => {
    expect(
      isStripeConnectPlatformProfileIncompleteError(
        new Error('rate_limit exceeded')
      )
    ).toBe(false);
  });
});

describe('Stripe Connect platform profile guard', () => {
  afterEach(() => {
    clearStripeConnectPlatformProfileBlock();
  });

  it('blocks onboarding after platform profile failure is classified', () => {
    expect(isStripeConnectPlatformProfileBlocked()).toBe(false);

    classifyStripeConnectOnboardError(PLATFORM_PROFILE_STRIPE_ERROR);

    expect(isStripeConnectPlatformProfileBlocked()).toBe(true);
  });

  it('can be cleared for tests and retries', () => {
    blockStripeConnectPlatformProfile();
    expect(isStripeConnectPlatformProfileBlocked()).toBe(true);

    clearStripeConnectPlatformProfileBlock();
    expect(isStripeConnectPlatformProfileBlocked()).toBe(false);
  });
});

describe('classifyStripeConnectOnboardError', () => {
  afterEach(() => {
    clearStripeConnectPlatformProfileBlock();
  });

  it('classifies incomplete platform profile errors as 503 warnings', () => {
    const result = classifyStripeConnectOnboardError(
      PLATFORM_PROFILE_STRIPE_ERROR
    );

    expect(result).toEqual(STRIPE_CONNECT_PLATFORM_PROFILE_INCOMPLETE_ERROR);
  });

  it('returns generic 500 classification for unknown Stripe failures', () => {
    const result = classifyStripeConnectOnboardError(
      new Error('rate_limit exceeded')
    );

    expect(result).toEqual({
      code: 'unknown',
      userMessage: 'Failed to start Stripe Connect onboarding',
      status: 500,
      logLevel: 'error',
    });
    expect(isStripeConnectPlatformProfileBlocked()).toBe(false);
  });
});
