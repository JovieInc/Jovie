import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { env } from '@/lib/env-server';
import { getActivePriceIds, validateStripeConfig } from '@/lib/stripe/config';

/**
 * Issue fingerprint of the last fatal startup alert emitted in this process.
 * Startup validation retries (see instrumentation.ts) re-run this check up to
 * five times; this deduplicates the fatal Sentry alert while the failure state
 * is unchanged. Reset on recovery so a later identical failure re-alerts.
 */
let lastAlertedIssuesKey: string | null = null;

/**
 * Validates Stripe billing configuration at server startup.
 *
 * Sends a Sentry fatal alert in production/preview if billing is misconfigured,
 * so the team is notified before users hit checkout failures. Repeated calls
 * with an unchanged failure state alert only once per process (per failure
 * episode); a changed failure state re-alerts.
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

  // Active price mappings are captured when the Stripe config module loads.
  // A later call in the same process must still see a price that was restored
  // after that import, then clear the dedupe key on the healthy result.
  const activePriceIds = getActivePriceIds();
  const visibilityPriceId = env.STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY;
  const configuredPriceIds =
    activePriceIds.length > 0
      ? activePriceIds
      : visibilityPriceId
        ? [visibilityPriceId]
        : [];
  if (configuredPriceIds.length === 0) {
    issues.push(
      'No Stripe price IDs configured — checkout will reject all requests. Set STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY to the Artist Visibility Pro $199/month USD recurring price ID.'
    );
  }

  if (issues.length > 0) {
    console.error('[STARTUP] Stripe billing misconfigured:', issues.join('; '));

    const vercelEnv = process.env.VERCEL_ENV;
    const isDeployed = vercelEnv === 'production' || vercelEnv === 'preview';

    if (isDeployed) {
      const issuesKey = issues.join('\n');
      const isUnchanged = issuesKey === lastAlertedIssuesKey;
      lastAlertedIssuesKey = issuesKey;

      if (!isUnchanged) {
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
              activePriceIdCount: configuredPriceIds.length,
              missingVars: configResult.missingVars,
            },
          }
        );
      }
    }
  }

  if (issues.length === 0) {
    lastAlertedIssuesKey = null;
  }

  return { healthy: issues.length === 0, issues };
}
