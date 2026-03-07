import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn(),
  useQuery: useQueryMock,
  useQueryClient: vi.fn(),
}));

import {
  billingStatusQueryOptions,
  useBillingStatusQuery,
} from '@/lib/queries/useBillingStatusQuery';
import { useEarningsQuery } from '@/lib/queries/useEarningsQuery';
import { useImpersonationQuery } from '@/lib/queries/useImpersonationQuery';
import { useInsightsSummaryQuery } from '@/lib/queries/useInsightsQuery';
import { useNotificationStatusQuery } from '@/lib/queries/useNotificationStatusQuery';

describe('query refetch policies', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue({});
  });

  it('disables focus refetch for impersonation status', () => {
    useImpersonationQuery();

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchOnWindowFocus: false,
      })
    );
  });

  it('disables focus refetch for billing status', () => {
    expect(billingStatusQueryOptions.refetchOnWindowFocus).toBe(false);

    useBillingStatusQuery();

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchOnWindowFocus: false,
      })
    );
  });

  it('disables mount and focus refetches for notification status', () => {
    useNotificationStatusQuery({
      artistId: 'artist_123',
      email: 'user@example.com',
    });

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchOnMount: false,
        refetchOnWindowFocus: false,
      })
    );
  });

  it('disables mount refetch for earnings', () => {
    useEarningsQuery();

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchOnMount: false,
      })
    );
  });

  it('disables mount refetch for insights summary', () => {
    useInsightsSummaryQuery();

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchOnMount: false,
      })
    );
  });
});
