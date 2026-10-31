import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HEADROOM_SCHEMA } from '@/lib/ovie/home/github-headroom';
import { emptyDeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { createEmptyShippingStateView } from '@/lib/ovie/shipping-state-client';
import { GithubHeadroomPanel } from './GithubHeadroomPanel';
import type { useHudShippingStateQuery } from './useHudShippingStateQuery';

const shipping = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('./useHudShippingStateQuery', () => ({
  useHudShippingStateQuery: () => shipping.query(),
}));
function snapshot() {
  return {
    view: createEmptyShippingStateView(),
    operationalTasks: {
      canonicalSource: 'linear',
      cacheMode: 'local-reconciled',
      syncState: 'syncing',
      sourceId: 'lane-pull-requests',
      observedAt: null,
      lastSyncedAt: null,
      freshnessDeadline: null,
      tasks: [],
      deltas: [],
    },
    isPending: false,
    isFetching: false,
    dataUpdatedAt: 0,
    operationalRequestState: 'idle',
    refetch: vi.fn(),
  } satisfies ReturnType<typeof useHudShippingStateQuery>;
}
beforeEach(() => shipping.query.mockReturnValue(snapshot()));

describe('GithubHeadroomPanel', () => {
  it('reads Unknown before the shared shipping snapshot arrives', () => {
    render(<GithubHeadroomPanel />);
    expect(screen.getByTestId('github-headroom-value')).toHaveTextContent(
      'Unknown'
    );
  });

  it('reads the report from the shared delivery view', () => {
    const delivery = emptyDeliverySummary();
    shipping.query.mockReturnValue({
      ...snapshot(),
      view: {
        ...createEmptyShippingStateView(),
        delivery: {
          ...delivery,
          lanes: {
            ...delivery.lanes,
            githubHeadroom: {
              schema: HEADROOM_SCHEMA,
              generatedAt: new Date().toISOString(),
              windows: [
                {
                  bucket: 'core',
                  windowStart: new Date(
                    Math.floor(Date.now() / 3_600_000) * 3_600_000
                  ).toISOString(),
                  limit: 5000,
                  samples: 1,
                  minRemaining: 0,
                  medianRemaining: 0,
                  exhaustedSamples: 1,
                  emptyShare: 1,
                },
              ],
            },
          },
        },
      },
    });
    render(<GithubHeadroomPanel />);
    expect(screen.getByTestId('github-headroom-value')).toHaveTextContent(
      '0 / 5,000'
    );
    expect(screen.getByRole('img', { name: 'Problem' })).toBeInTheDocument();
  });
});
