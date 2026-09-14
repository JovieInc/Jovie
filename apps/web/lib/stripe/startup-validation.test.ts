import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Artist Visibility billing startup contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_fixture');
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_fixture');
    vi.stubEnv(
      'STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY',
      'price_visibility'
    );
    vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', undefined);
    vi.stubEnv('STRIPE_PRICE_PRO_ANNUAL', undefined);
    vi.stubEnv('STRIPE_PRICE_PRO_YEARLY', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('accepts only the dedicated monthly price without requiring legacy Pro prices', async () => {
    const { validateStripeBillingConfig } = await import(
      './startup-validation'
    );
    const { getActivePriceIds, getPriceMappingDetails } = await import(
      './config'
    );

    expect(validateStripeBillingConfig()).toEqual({
      healthy: true,
      issues: [],
    });
    expect(getActivePriceIds()).toEqual(['price_visibility']);
    expect(getPriceMappingDetails('price_visibility')).toMatchObject({
      plan: 'pro',
      amount: 19900,
      currency: 'usd',
      interval: 'month',
    });
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it.each(['STRIPE_PRICE_PRO_ANNUAL', 'STRIPE_PRICE_PRO_YEARLY'])(
    'preserves legacy monthly and %s webhook semantics without offering them at checkout',
    async annualKey => {
      vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_old_monthly');
      vi.stubEnv(annualKey, 'price_old_annual');
      const { validateStripeBillingConfig } = await import(
        './startup-validation'
      );
      const { getActivePriceIds, getPriceMappingDetails } = await import(
        './config'
      );
      expect(validateStripeBillingConfig().healthy).toBe(true);
      expect(getActivePriceIds()).toEqual(['price_visibility']);
      expect(getPriceMappingDetails('price_old_monthly')).toMatchObject({
        plan: 'pro',
        amount: 3900,
        interval: 'month',
        legacy: true,
      });
      expect(getPriceMappingDetails('price_old_annual')).toMatchObject({
        plan: 'pro',
        amount: 37500,
        interval: 'year',
        legacy: true,
      });
    }
  );

  it.each(['production', 'preview', 'development'])(
    'reports the actionable missing price in %s even with legacy prices configured',
    async deployment => {
      vi.stubEnv('VERCEL_ENV', deployment);
      vi.stubEnv('STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY', undefined);
      vi.stubEnv('STRIPE_PRICE_PRO_MONTHLY', 'price_old_monthly');
      vi.stubEnv('STRIPE_PRICE_PRO_YEARLY', 'price_old_yearly');
      const { validateStripeBillingConfig } = await import(
        './startup-validation'
      );
      const { getActivePriceIds } = await import('./config');
      const result = validateStripeBillingConfig();
      expect(result.healthy).toBe(false);
      expect(getActivePriceIds()).toEqual([]);
      expect(result.issues).toEqual([
        'Missing Stripe env vars: STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY',
        'No Stripe price IDs configured — checkout will reject all requests. Set STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY to the Artist Visibility Pro $199/month USD recurring price ID.',
      ]);
      expect(Sentry.captureMessage).toHaveBeenCalledTimes(
        deployment === 'development' ? 0 : 1
      );
      if (deployment !== 'development') {
        expect(Sentry.captureMessage).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            level: 'fatal',
            extra: expect.objectContaining({ activePriceIdCount: 0 }),
          })
        );
      }
    }
  );

  it('still reports missing Stripe credentials when the offer price is configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', undefined);
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', undefined);
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', undefined);
    const { validateStripeBillingConfig } = await import(
      './startup-validation'
    );
    expect(validateStripeBillingConfig()).toEqual({
      healthy: false,
      issues: [
        'Missing Stripe env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      ],
    });
  });
});
