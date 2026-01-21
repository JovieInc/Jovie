/**
 * Subscription Error Classifier
 *
 * Classifies Stripe subscription errors and determines appropriate recovery actions.
 */

import type Stripe from 'stripe';

/**
 * Classification result for subscription errors.
 */
export interface SubscriptionErrorClassification {
  /** Type of error encountered */
  type: 'not_found' | 'stripe_error' | 'unknown';
  /** Whether this is a recoverable error */
  isRecoverable: boolean;
  /** Human-readable error message */
  message: string;
  /** Original error for logging */
  originalError: unknown;
}

/**
 * Classifies a Stripe subscription retrieval error.
 * Determines if subscription is deleted, temporarily unavailable, or has other issues.
 *
 * @param error - The error from Stripe subscription retrieval
 * @returns Classification with recommended action
 */
export function classifySubscriptionError(
  error: unknown
): SubscriptionErrorClassification {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Subscription deleted/not found in Stripe
  if (errorMessage.includes('No such subscription')) {
    return {
      type: 'not_found',
      isRecoverable: true,
      message: 'Subscription not found in Stripe (likely deleted)',
      originalError: error,
    };
  }

  // Other Stripe API errors (rate limit, network, etc.)
  if (error instanceof Error && error.name === 'StripeError') {
    return {
      type: 'stripe_error',
      isRecoverable: false,
      message: errorMessage,
      originalError: error,
    };
  }

  // Unknown error
  return {
    type: 'unknown',
    isRecoverable: false,
    message: errorMessage,
    originalError: error,
  };
}

/**
 * Safely retrieves a Stripe subscription with error classification.
 *
 * @param stripe - Stripe client instance
 * @param subscriptionId - Subscription ID to retrieve
 * @returns Subscription or null with error classification
 */
export async function retrieveSubscriptionSafely(
  stripe: Stripe,
  subscriptionId: string
): Promise<{
  subscription: Stripe.Subscription | null;
  error: SubscriptionErrorClassification | null;
}> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return { subscription, error: null };
  } catch (err) {
    const classification = classifySubscriptionError(err);
    return { subscription: null, error: classification };
  }
}
