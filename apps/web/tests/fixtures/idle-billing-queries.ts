import { vi } from 'vitest';

/** Billing dependencies for tests focused on their parent panel, without network. */
export const idleBillingQueries = {
  useCheckoutMutation: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
  usePricingOptionsQuery: () => ({
    data: { options: [] },
    isPending: false,
    error: null,
  }),
};
