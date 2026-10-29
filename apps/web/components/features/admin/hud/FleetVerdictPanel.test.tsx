import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DeliveryLanes,
  emptyDeliverySummary,
} from '@/lib/ovie/shipping-state/contract';
import { createEmptyShippingStateView } from '@/lib/ovie/shipping-state-client';
import { FleetVerdictPanel, FleetVerdictPanelView } from './FleetVerdictPanel';
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

describe('FleetVerdictPanel', () => {
  it('reads lane health from the shared delivery view', () => {
    const delivery = emptyDeliverySummary();
    shipping.query.mockReturnValue({
      ...snapshot(),
      view: {
        ...createEmptyShippingStateView(),
        delivery: {
          ...delivery,
          lanes: {
            ...delivery.lanes,
            running: { state: 'measured-nonzero', value: 2 },
            slots: { state: 'measured-nonzero', value: 3 },
            stale: false,
          },
        },
      },
    });
    render(<FleetVerdictPanel />);
    expect(screen.getByTestId('fleet-verdict-panel')).toHaveTextContent(
      'Healthy'
    );
    expect(screen.getByTestId('fleet-verdict-panel')).toHaveTextContent(
      '2 of 3 lanes running'
    );
  });

  it('distinguishes loading from a failed shipping read', () => {
    shipping.query.mockReturnValue({ ...snapshot(), isPending: true });
    const { rerender } = render(<FleetVerdictPanel />);
    expect(screen.getByText('Loading fleet health…')).toBeVisible();
    shipping.query.mockReturnValue({
      ...snapshot(),
      view: { ...createEmptyShippingStateView(), lastError: 'failed' },
    });
    rerender(<FleetVerdictPanel />);
    expect(screen.getByTestId('fleet-verdict-panel')).toHaveTextContent(
      'shipping read failed'
    );
  });
});

const lanes = {
  heldByReason: { 'needs-human-decision': 4 },
  failedByReason: { 'harness-failed': 61 },
} as unknown as DeliveryLanes;

describe('FleetVerdictPanelView', () => {
  it('names the level, every reason, and the counts behind it', () => {
    render(
      <FleetVerdictPanelView
        verdict={{
          level: 'degraded',
          headline:
            'Fleet degraded: Remediation alerts are not being acknowledged',
          reasons: ['Remediation alerts are not being acknowledged'],
          capacity: '2 of 3 lanes running',
        }}
        lanes={lanes}
      />
    );
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 lanes running')).toBeInTheDocument();
    expect(screen.getByText('failed: harness-failed')).toBeInTheDocument();
    expect(screen.getByText('61')).toBeInTheDocument();
    expect(screen.getByText('needs-human-decision')).toBeInTheDocument();
  });

  it('renders an unmeasured fleet without a healthy claim', () => {
    render(
      <FleetVerdictPanelView
        verdict={{
          level: 'unknown',
          headline: 'Fleet health not measured',
          reasons: [],
          capacity: null,
        }}
        lanes={null}
      />
    );
    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryByText('Healthy')).toBeNull();
  });
});
