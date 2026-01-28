/**
 * Plan Change Operations
 *
 * Handles subscription plan upgrades and downgrades with proration.
 * Uses Stripe's subscription update API for seamless plan changes.
 *
 * Upgrade Flow:
 * - Immediate switch to new plan
 * - Proration credit for unused portion of current plan
 * - Immediate charge for prorated amount of new plan
 *
 * Downgrade Flow:
 * - Uses cancel_at_period_end + new subscription approach
 * - Or immediate change with proration (configurable)
 */

import 'server-only';
import type Stripe from 'stripe';

import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

import { stripe } from './client';
import {
  getActivePriceIds,
  getPriceMappingDetails,
  type PlanType,
  PRICE_MAPPINGS,
} from './config';

/**
 * Plan hierarchy for determining upgrade vs downgrade
 * Higher number = higher tier
 */
const PLAN_HIERARCHY: Record<PlanType, number> = {
  free: 0,
  pro: 1,
  growth: 2,
};

/**
 * Result of a proration preview
 */
export interface ProrationPreview {
  /** Amount to be charged/credited immediately (in cents) */
  immediateAmount: number;
  /** Currency code (e.g., 'usd') */
  currency: string;
  /** Description of the proration */
  description: string;
  /** Whether this is an upgrade (true) or downgrade (false) */
  isUpgrade: boolean;
  /** Current plan details */
  currentPlan: {
    name: string;
    priceId: string;
    interval: 'month' | 'year';
  };
  /** New plan details */
  newPlan: {
    name: string;
    priceId: string;
    interval: 'month' | 'year';
  };
  /** When the change takes effect */
  effectiveDate: Date;
  /** Line items for the proration */
  lineItems: Array<{
    description: string;
    amount: number;
    quantity: number;
  }>;
}

/**
 * Options for previewing a plan change
 */
export interface PreviewPlanChangeOptions {
  /** Stripe customer ID */
  customerId: string;
  /** Target price ID for the new plan */
  newPriceId: string;
}

/**
 * Options for executing a plan change
 */
export interface ExecutePlanChangeOptions {
  /** Stripe subscription ID */
  subscriptionId: string;
  /** Target price ID for the new plan */
  newPriceId: string;
  /** Whether to prorate (default: true for upgrades, false for downgrades) */
  prorate?: boolean;
}

/**
 * Result of executing a plan change
 */
export interface PlanChangeResult {
  success: boolean;
  subscription?: Stripe.Subscription;
  error?: string;
  /** True if the change is scheduled for the end of billing period */
  isScheduledChange: boolean;
  /** When the new plan takes effect */
  effectiveDate: Date;
}

/**
 * Subscription with period fields we need (Stripe SDK types vary by version)
 */
interface SubscriptionWithPeriod extends Stripe.Subscription {
  current_period_end: number;
  current_period_start: number;
}

/**
 * Get the active subscription for a customer
 */
export async function getActiveSubscription(
  customerId: string
): Promise<SubscriptionWithPeriod | null> {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
      expand: ['data.items.data.price'],
    });

    const sub = subscriptions.data[0];
    if (!sub) return null;

    // Cast to include period fields (they exist on the object, just not always in types)
    return sub as SubscriptionWithPeriod;
  } catch (error) {
    captureError('Error fetching active subscription', error, { customerId });
    return null;
  }
}

/**
 * Determine if a plan change is an upgrade or downgrade
 */
export function isPlanUpgrade(
  currentPlan: PlanType,
  newPlan: PlanType
): boolean {
  return PLAN_HIERARCHY[newPlan] > PLAN_HIERARCHY[currentPlan];
}

/**
 * Determine if switching billing intervals (monthly <-> yearly)
 */
export function isIntervalChange(
  currentInterval: 'month' | 'year',
  newInterval: 'month' | 'year'
): boolean {
  return currentInterval !== newInterval;
}

/**
 * Preview the proration for a plan change
 *
 * Uses Stripe's invoice preview to calculate the exact proration amounts
 * before executing the change.
 */
export async function previewPlanChange(
  options: PreviewPlanChangeOptions
): Promise<ProrationPreview | null> {
  const { customerId, newPriceId } = options;

  try {
    // Validate new price ID
    const activePriceIds = getActivePriceIds();
    if (!activePriceIds.includes(newPriceId)) {
      logger.warn('Invalid price ID for plan change preview', { newPriceId });
      return null;
    }

    // Get current subscription
    const subscription = await getActiveSubscription(customerId);
    if (!subscription) {
      logger.warn('No active subscription for plan change preview', {
        customerId,
      });
      return null;
    }

    // Get current subscription item and price
    const currentItem = subscription.items.data[0];
    if (!currentItem?.price?.id) {
      logger.warn('Subscription has no price item', {
        subscriptionId: subscription.id,
      });
      return null;
    }

    const currentPriceId = currentItem.price.id;
    const currentPriceDetails = getPriceMappingDetails(currentPriceId);
    const newPriceDetails = getPriceMappingDetails(newPriceId);

    if (!currentPriceDetails || !newPriceDetails) {
      logger.warn('Cannot find price details for plan change', {
        currentPriceId,
        newPriceId,
      });
      return null;
    }

    // Check if this is an upgrade or downgrade
    const isUpgrade = isPlanUpgrade(
      currentPriceDetails.plan,
      newPriceDetails.plan
    );

    // Calculate proration using Stripe's invoice preview
    const previewInvoice = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: subscription.id,
      subscription_details: {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_behavior: isUpgrade ? 'create_prorations' : 'none',
        proration_date: Math.floor(Date.now() / 1000),
      },
    });

    // Calculate immediate amount (for upgrades) or 0 (for downgrades)
    const immediateAmount = isUpgrade ? previewInvoice.amount_due : 0;

    // Extract line items for transparency
    const lineItems =
      previewInvoice.lines?.data.map(line => ({
        description: line.description || 'Plan change',
        amount: line.amount,
        quantity: line.quantity || 1,
      })) || [];

    // Calculate effective date using period end from subscription
    const periodEndMs = subscription.current_period_end * 1000;
    const effectiveDate = isUpgrade
      ? new Date() // Upgrades are immediate
      : new Date(periodEndMs); // Downgrades at period end

    return {
      immediateAmount,
      currency: previewInvoice.currency,
      description: isUpgrade
        ? `Upgrade to ${newPriceDetails.description}`
        : `Downgrade to ${newPriceDetails.description} (effective ${effectiveDate.toLocaleDateString()})`,
      isUpgrade,
      currentPlan: {
        name: currentPriceDetails.description,
        priceId: currentPriceId,
        interval: currentPriceDetails.interval,
      },
      newPlan: {
        name: newPriceDetails.description,
        priceId: newPriceId,
        interval: newPriceDetails.interval,
      },
      effectiveDate,
      lineItems,
    };
  } catch (error) {
    captureError('Error previewing plan change', error, {
      customerId,
      newPriceId,
    });
    return null;
  }
}

/**
 * Execute a plan change (upgrade or downgrade)
 *
 * - Upgrades: Immediate switch with proration
 * - Downgrades: Can be immediate or scheduled via billing_cycle_anchor
 */
export async function executePlanChange(
  options: ExecutePlanChangeOptions
): Promise<PlanChangeResult> {
  const { subscriptionId, newPriceId, prorate } = options;

  try {
    // Validate new price ID
    const activePriceIds = getActivePriceIds();
    if (!activePriceIds.includes(newPriceId)) {
      return {
        success: false,
        error: 'Invalid price ID',
        isScheduledChange: false,
        effectiveDate: new Date(),
      };
    }

    // Get current subscription with expanded price data
    const subscriptionRaw = await stripe.subscriptions.retrieve(
      subscriptionId,
      {
        expand: ['items.data.price'],
      }
    );
    // Cast through unknown since Stripe SDK response wrapper type differs from base type
    const subscription = subscriptionRaw as unknown as SubscriptionWithPeriod;

    if (!subscription || subscription.status !== 'active') {
      return {
        success: false,
        error: 'No active subscription found',
        isScheduledChange: false,
        effectiveDate: new Date(),
      };
    }

    // Get current subscription item
    const currentItem = subscription.items.data[0];
    if (!currentItem?.price?.id) {
      return {
        success: false,
        error: 'Subscription has no price item',
        isScheduledChange: false,
        effectiveDate: new Date(),
      };
    }

    const currentPriceId = currentItem.price.id;
    const currentPriceDetails = getPriceMappingDetails(currentPriceId);
    const newPriceDetails = getPriceMappingDetails(newPriceId);

    if (!currentPriceDetails || !newPriceDetails) {
      return {
        success: false,
        error: 'Cannot determine plan details',
        isScheduledChange: false,
        effectiveDate: new Date(),
      };
    }

    // Check if same plan
    if (currentPriceId === newPriceId) {
      return {
        success: false,
        error: 'Already on this plan',
        isScheduledChange: false,
        effectiveDate: new Date(),
      };
    }

    // Determine if upgrade or downgrade
    const isUpgrade = isPlanUpgrade(
      currentPriceDetails.plan,
      newPriceDetails.plan
    );

    // Also consider interval changes (yearly to monthly is a "downgrade" in value)
    const isIntervalDowngrade =
      currentPriceDetails.plan === newPriceDetails.plan &&
      currentPriceDetails.interval === 'year' &&
      newPriceDetails.interval === 'month';

    const shouldProrate = prorate ?? isUpgrade;
    const isScheduledChange = !isUpgrade || isIntervalDowngrade;

    logger.info('Executing plan change', {
      subscriptionId,
      currentPlan: currentPriceDetails.description,
      newPlan: newPriceDetails.description,
      isUpgrade,
      isScheduledChange,
      shouldProrate,
    });

    // For both upgrades and downgrades, use subscription update
    // Stripe handles proration automatically
    const updatedSubscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_behavior: shouldProrate ? 'create_prorations' : 'none',
        metadata: {
          ...subscription.metadata,
          previous_plan: currentPriceDetails.plan,
          changed_at: new Date().toISOString(),
        },
      }
    );

    // Calculate effective date
    const periodEndMs = subscription.current_period_end * 1000;
    const effectiveDate = isScheduledChange
      ? new Date(periodEndMs)
      : new Date();

    logger.info('Plan change executed successfully', {
      subscriptionId,
      newPlan: newPriceDetails.description,
      isScheduledChange,
      effectiveDate: effectiveDate.toISOString(),
    });

    return {
      success: true,
      subscription: updatedSubscription,
      isScheduledChange,
      effectiveDate,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to change plan';

    captureError('Error executing plan change', error, {
      subscriptionId,
      newPriceId,
    });

    return {
      success: false,
      error: errorMessage,
      isScheduledChange: false,
      effectiveDate: new Date(),
    };
  }
}

/**
 * Cancel a scheduled plan change
 *
 * For downgrades that were scheduled, this reverts to the original plan.
 */
export async function cancelScheduledPlanChange(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Check if there's a pending schedule
    if (!subscription.schedule) {
      return {
        success: false,
        error: 'No scheduled change to cancel',
      };
    }

    const scheduleId =
      typeof subscription.schedule === 'string'
        ? subscription.schedule
        : subscription.schedule.id;

    await stripe.subscriptionSchedules.cancel(scheduleId);

    logger.info('Cancelled scheduled plan change', { subscriptionId });

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to cancel scheduled change';

    captureError('Error cancelling scheduled plan change', error, {
      subscriptionId,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Get available plan upgrade/downgrade options for a customer
 */
export async function getAvailablePlanChanges(customerId: string): Promise<{
  currentPlan: PlanType | null;
  currentPriceId: string | null;
  currentInterval: 'month' | 'year' | null;
  availableChanges: Array<{
    priceId: string;
    plan: PlanType;
    interval: 'month' | 'year';
    amount: number;
    description: string;
    isUpgrade: boolean;
    isIntervalChange: boolean;
  }>;
} | null> {
  try {
    // Handle empty customer ID (no Stripe customer yet)
    if (!customerId) {
      const allOptions = Object.values(PRICE_MAPPINGS).map(mapping => ({
        priceId: mapping.priceId,
        plan: mapping.plan,
        interval: mapping.interval,
        amount: mapping.amount,
        description: mapping.description,
        isUpgrade: true,
        isIntervalChange: false,
      }));

      return {
        currentPlan: 'free',
        currentPriceId: null,
        currentInterval: null,
        availableChanges: allOptions.sort((a, b) => a.amount - b.amount),
      };
    }

    const subscription = await getActiveSubscription(customerId);

    if (!subscription) {
      // No subscription - show all options as "upgrades" from free
      const allOptions = Object.values(PRICE_MAPPINGS).map(mapping => ({
        priceId: mapping.priceId,
        plan: mapping.plan,
        interval: mapping.interval,
        amount: mapping.amount,
        description: mapping.description,
        isUpgrade: true,
        isIntervalChange: false,
      }));

      return {
        currentPlan: 'free',
        currentPriceId: null,
        currentInterval: null,
        availableChanges: allOptions.sort((a, b) => a.amount - b.amount),
      };
    }

    const currentItem = subscription.items.data[0];
    const currentPriceId = currentItem?.price?.id;

    if (!currentPriceId) {
      return null;
    }

    const currentPriceDetails = getPriceMappingDetails(currentPriceId);
    if (!currentPriceDetails) {
      return null;
    }

    // Get all available plans except current
    const availableChanges = Object.values(PRICE_MAPPINGS)
      .filter(mapping => mapping.priceId !== currentPriceId)
      .map(mapping => ({
        priceId: mapping.priceId,
        plan: mapping.plan,
        interval: mapping.interval,
        amount: mapping.amount,
        description: mapping.description,
        isUpgrade: isPlanUpgrade(currentPriceDetails.plan, mapping.plan),
        isIntervalChange: isIntervalChange(
          currentPriceDetails.interval,
          mapping.interval
        ),
      }))
      .sort((a, b) => {
        // Sort: upgrades first, then by amount
        if (a.isUpgrade !== b.isUpgrade) {
          return a.isUpgrade ? -1 : 1;
        }
        return a.amount - b.amount;
      });

    return {
      currentPlan: currentPriceDetails.plan,
      currentPriceId,
      currentInterval: currentPriceDetails.interval,
      availableChanges,
    };
  } catch (error) {
    captureError('Error getting available plan changes', error, { customerId });
    return null;
  }
}
