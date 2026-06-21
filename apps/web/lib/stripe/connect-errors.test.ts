import { describe, expect, it } from 'vitest';
import { classifyStripeConnectOnboardError } from './connect-errors';

describe('classifyStripeConnectOnboardError', () => {
  it('classifies incomplete platform profile errors as 503 warnings', () => {
    const stripeError = {
      type: 'StripeInvalidRequestError',
      message:
        'You must complete your platform profile to use Connect and create live connected accounts. Visit your dashboard at https://dashboard.stripe.com/connect/accounts/overview to answer the questionnaire.',
    };

    const result = classifyStripeConnectOnboardError(stripeError);

    expect(result).toEqual({
      code: 'platform_profile_incomplete',
      userMessage:
        'Payout setup is temporarily unavailable. Please try again later.',
      status: 503,
      logLevel: 'warning',
    });
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
  });
});
