'use client';

/**
 * Billing mutation hooks for checkout and portal operations.
 *
 * Provides React Query mutations for Stripe billing actions with:
 * - Automatic cache invalidation
 * - Consistent error handling with toasts
 * - Type-safe inputs and outputs
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { captureError } from '@/lib/error-tracking';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';
import { handleMutationError } from './mutation-utils';

/**
 * Input for creating a checkout session.
 */
export interface CheckoutInput {
  priceId: string;
}

/**
 * Response from the checkout API.
 */
export interface CheckoutResponse {
  url: string;
  sessionId?: string;
  alreadySubscribed?: boolean;
}

/**
 * Response from the portal API.
 */
export interface PortalResponse {
  url: string;
  sessionId?: string;
}

/**
 * Create a Stripe checkout session via POST.
 */
async function createCheckoutSession(
  input: CheckoutInput
): Promise<CheckoutResponse> {
  return fetchWithTimeout<CheckoutResponse>('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId: input.priceId }),
  });
}

/**
 * Create a Stripe billing portal session via POST.
 */
async function createPortalSession(): Promise<PortalResponse> {
  return fetchWithTimeout<PortalResponse>('/api/stripe/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Hook for creating a Stripe checkout session.
 *
 * Returns the checkout URL for redirect. Does not automatically redirect
 * to allow the component to handle navigation and track analytics.
 *
 * @example
 * ```tsx
 * const { mutate: checkout, isPending } = useCheckoutMutation();
 *
 * const handleUpgrade = (priceId: string) => {
 *   track('checkout_initiated', { priceId });
 *   checkout({ priceId }, {
 *     onSuccess: (data) => {
 *       track('checkout_redirect', { priceId });
 *       window.location.href = data.url;
 *     },
 *   });
 * };
 * ```
 */
export function useCheckoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCheckoutSession,

    onSuccess: () => {
      // Invalidate billing queries so data refreshes when user returns from Stripe
      queryClient.invalidateQueries({
        queryKey: queryKeys.billing.all,
      });
    },

    onError: error => {
      captureError('Checkout mutation failed', error, {
        route: '/api/stripe/checkout',
      });
      handleMutationError(error, 'Failed to start checkout');
    },
  });
}

/**
 * Hook for creating a Stripe billing portal session.
 *
 * Returns the portal URL for redirect. Does not automatically redirect
 * to allow the component to handle navigation and track analytics.
 *
 * @example
 * ```tsx
 * const { mutate: openPortal, isPending } = usePortalMutation();
 *
 * const handleManageBilling = () => {
 *   track('billing_portal_clicked');
 *   openPortal(undefined, {
 *     onSuccess: (data) => {
 *       track('billing_portal_redirect');
 *       window.location.href = data.url;
 *     },
 *   });
 * };
 * ```
 */
export function usePortalMutation() {
  return useMutation({
    mutationFn: createPortalSession,

    onError: error => {
      captureError('Portal mutation failed', error, {
        route: '/api/stripe/portal',
      });
      handleMutationError(error, 'Failed to open billing portal');
    },
  });
}

/**
 * Response from the cancel subscription API.
 */
export interface CancelSubscriptionResponse {
  success: boolean;
  status?: string;
}

/**
 * Cancel subscription via POST.
 */
async function cancelSubscriptionRequest(): Promise<CancelSubscriptionResponse> {
  return fetchWithTimeout<CancelSubscriptionResponse>('/api/stripe/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Hook for cancelling a subscription in-app.
 *
 * Invalidates billing queries on success so the UI updates immediately.
 *
 * @example
 * ```tsx
 * const { mutate: cancelSub, isPending } = useCancelSubscriptionMutation();
 *
 * const handleCancel = () => {
 *   cancelSub(undefined, {
 *     onSuccess: () => {
 *       track('subscription_cancelled');
 *     },
 *   });
 * };
 * ```
 */
export function useCancelSubscriptionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelSubscriptionRequest,

    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.billing.status(),
      });

      const previousBilling = queryClient.getQueryData(
        queryKeys.billing.status()
      );

      queryClient.setQueryData(
        queryKeys.billing.status(),
        (old: { isPro: boolean; plan: string | null } | undefined) =>
          old ? { ...old, isPro: false, plan: 'free' } : old
      );

      return { previousBilling };
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.billing.all,
      });
    },

    onError: (error, _variables, context) => {
      if (context?.previousBilling) {
        queryClient.setQueryData(
          queryKeys.billing.status(),
          context.previousBilling
        );
      }
      captureError('Cancel subscription mutation failed', error, {
        route: '/api/stripe/cancel',
      });
      handleMutationError(error, 'Failed to cancel subscription');
    },
  });
}
