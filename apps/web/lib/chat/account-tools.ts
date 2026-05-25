import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { APP_ROUTES } from '@/constants/routes';
import { publicEnv } from '@/lib/env-public';
import { createBillingPortalSession } from '@/lib/stripe/client';
import { getUserBillingInfo } from '@/lib/stripe/customer-sync';
import type { ChatAccountContext } from './account-context';

function buildAbsoluteUrl(path: string): string {
  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL || 'https://jov.ie';
  return new URL(path, baseUrl).toString();
}

function getAccountNextAction(accountContext: ChatAccountContext): string {
  if (accountContext.billingVerification === 'unavailable') {
    return 'Retry billing verification before changing paid-feature access.';
  }

  if (accountContext.merchAccess.available) {
    return 'Merch creation is available for this account.';
  }

  return 'Use billing settings to manage plan access.';
}

export function buildAccountStatusPayload(accountContext: ChatAccountContext) {
  return {
    success: true as const,
    email: accountContext.email,
    plan: accountContext.plan,
    displayPlan: accountContext.displayPlan,
    isPro: accountContext.isPro,
    billingVerification: accountContext.billingVerification,
    planMismatch: accountContext.planMismatch,
    merchAccess: accountContext.merchAccess,
    entitlements: accountContext.entitlements,
    billing: accountContext.billing,
    nextAction: getAccountNextAction(accountContext),
  };
}

export function createAccountChatTools(accountContext: ChatAccountContext) {
  return {
    showAccountStatus: tool({
      description:
        'Show the authenticated account plan, billing verification state, feature access, merch access, and safe next action.',
      inputSchema: z.object({}),
      execute: async () => buildAccountStatusPayload(accountContext),
    }),
    showUsage: tool({
      description:
        'Show AI chat usage, limits, remaining messages, and reset times for the authenticated account.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!accountContext.usage) {
          return {
            success: false as const,
            billingVerification: accountContext.billingVerification,
            error:
              'Usage is temporarily unavailable because billing verification failed.',
          };
        }

        return {
          success: true as const,
          plan: accountContext.plan,
          displayPlan: accountContext.displayPlan,
          usage: accountContext.usage,
        };
      },
    }),
    openBillingPortal: tool({
      description:
        'Open Stripe billing portal when available, or return the billing/settings route when no Stripe customer exists. Does not mutate subscriptions.',
      inputSchema: z.object({}),
      execute: async () => {
        const billing = await getUserBillingInfo();
        if (!billing.success) {
          return {
            success: false as const,
            billingVerification: 'unavailable' as const,
            error: 'Billing is temporarily unavailable.',
          };
        }

        const stripeCustomerId = billing.data?.stripeCustomerId;
        if (!stripeCustomerId) {
          return {
            success: true as const,
            action: 'open_url' as const,
            url: buildAbsoluteUrl(APP_ROUTES.SETTINGS_BILLING),
            message: 'No Stripe billing portal exists for this account yet.',
          };
        }

        const session = await createBillingPortalSession({
          customerId: stripeCustomerId,
          returnUrl: buildAbsoluteUrl(APP_ROUTES.SETTINGS_BILLING),
        }).catch(() => null);

        if (!session?.url) {
          return {
            success: false as const,
            billingVerification: 'unavailable' as const,
            error: 'Billing portal is temporarily unavailable.',
          };
        }

        return {
          success: true as const,
          action: 'open_url' as const,
          url: session.url,
        };
      },
    }),
  };
}
