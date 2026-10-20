import { describe, expect, it } from 'vitest';
import { FetchError } from '@/lib/queries/fetch';
import { queryKeys } from '@/lib/queries/keys';
import { pricingOptionsQueryOptions } from '@/lib/queries/usePricingOptionsQuery';

describe('pricingOptionsQueryOptions', () => {
  it('does not retry a pricing failure, so the recovery banner is not stuck behind the skeleton', () => {
    const error = new FetchError('unavailable', 503, 'unavailable');
    expect(pricingOptionsQueryOptions.retry(0, error)).toBe(false);
    expect(pricingOptionsQueryOptions.refetchOnMount).toBe(false);
    expect(pricingOptionsQueryOptions.queryKey).toEqual(
      queryKeys.billing.pricingOptions()
    );
  });
});
