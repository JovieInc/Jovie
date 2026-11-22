import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryLanes } from '@/lib/ovie/shipping-state/contract';
import { FleetVerdictPanel, FleetVerdictPanelView } from './FleetVerdictPanel';

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

const unmeasured = { schema: 'ovie.shipping-state.v1', state: 'unknown' };

describe('FleetVerdictPanel polling', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('polls the shipping read so a cold "not measured" answer can heal', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => unmeasured,
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <FleetVerdictPanel />
      </QueryClientProvider>
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(31_000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    expect(screen.getByTestId('fleet-verdict-panel')).toBeTruthy();
    client.clear();
  });
});
