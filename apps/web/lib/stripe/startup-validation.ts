import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { getActivePriceIds, validateStripeConfig } from '@/lib/stripe/config';

/**
 * Validates Stripe billing configuration at server startup.
 *
 * Sends a Sentry fatal alert in production/preview if billing is misconfigured,
 * so the team is notified before users hit checkout failures.
 */
export function validateStripeBillingConfig(): {
  healthy: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  const configResult = validateStripeConfig();
  if (!configResult.isValid) {
    issues.push(
      `Missing Stripe env vars: ${configResult.missingVars.join(', ')}`
    );
  }

  const activePriceIds = getActivePriceIds();
  if (activePriceIds.length === 0) {
    issues.push(
      'No Stripe price IDs configured — checkout will reject all requests. Set STRIPE_PRICE_PRO_MONTHLY and/or STRIPE_PRICE_PRO_YEARLY.'
    );
  }

  if (issues.length > 0) {
    console.error('[STARTUP] Stripe billing misconfigured:', issues.join('; '));

    const vercelEnv = process.env.VERCEL_ENV;
    const isDeployed = vercelEnv === 'production' || vercelEnv === 'preview';

    if (isDeployed) {
      Sentry.captureMessage(
        `Stripe billing misconfigured at startup: ${issues.join('; ')}`,
        {
          level: 'fatal',
          tags: {
            context: 'stripe_startup_validation',
            vercel_env: vercelEnv,
          },
          extra: {
            issues,
            activePriceIdCount: activePriceIds.length,
            missingVars: configResult.missingVars,
          },
        }
      );
    }
  }

  return { healthy: issues.length === 0, issues };
}
