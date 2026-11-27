import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import type { DeliveryLanes } from '@/lib/ovie/shipping-state/contract';
import { measuredCount } from '@/lib/ovie/shipping-state/contract';
import { createEmptyShippingStateView } from '@/lib/ovie/shipping-state-client';
import { shippingStateQueryOptions } from '@/lib/queries/shipping-state';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FleetVerdictPanel, FleetVerdictPanelView } from './FleetVerdictPanel';

function renderPanel(client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <FleetVerdictPanel />
    </QueryClientProvider>
  );
}

const UNAVAILABLE =
  'Fleet health unavailable: the shipping read failed. Refresh to retry.';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FleetVerdictPanel certificate', () => {
  it('shows the loading line while the shipping read is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {}))
    );
    const { container } = renderPanel();
    expect(screen.getByText('Loading fleet health…')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('says the read failed when the server errors', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: 'unavailable' }, { status: 500 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderPanel();
    expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText('Syncing')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/hud/shipping-state',
      expect.objectContaining({ cache: 'no-store' })
    );
    await expectNoA11yViolations(container);
  });

  it('says the read failed when the network is offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    );
    renderPanel();
    expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it('derives the verdict from cached lanes without refetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const view = createEmptyShippingStateView();
    const client = new QueryClient();
    // The panel reads only delivery.lanes, so the rest of the projection is
    // left as the empty view's.
    const seeded = {
      ...view,
      delivery: {
        ...view.delivery,
        lanes: {
          ...view.delivery.lanes,
          running: measuredCount(3),
          slots: measuredCount(3),
          heldByReason: { 'needs-human-decision': 2 },
        },
      },
    } as unknown as ShippingCockpitProjection;
    client.setQueryData(shippingStateQueryOptions.queryKey, seeded);
    const { container } = renderPanel(client);
    expect(screen.getByText('3 of 3 lanes running')).toBeInTheDocument();
    expect(screen.getByText('needs-human-decision')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('sorts held and failed reasons by count', () => {
    render(
      <FleetVerdictPanelView
        verdict={{
          level: 'down',
          headline: 'Fleet not reporting: the lanes feed is stale',
          reasons: ['The lanes feed is stale'],
          capacity: null,
        }}
        lanes={
          {
            heldByReason: { small: 1, large: 9 },
            failedByReason: { 'harness-failed': 4 },
          } as unknown as DeliveryLanes
        }
      />
    );
    const terms = screen.getAllByRole('term').map(term => term.textContent);
    expect(terms).toEqual(['large', 'failed: harness-failed', 'small']);
    expect(screen.getByText('Not reporting')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'The lanes feed is stale'
    );
  });

  it('keeps long reasons and an RTL document axe-clean', async () => {
    const { container } = render(
      <div dir='rtl'>
        <FleetVerdictPanelView
          verdict={{
            level: 'degraded',
            headline: 'Fleet degraded: many reasons (+2 more)',
            reasons: ['First reason', 'Second reason', 'Third reason'],
            capacity: '2 of 3 lanes running',
          }}
          lanes={
            {
              heldByReason: { 'waiting-on-a-very-long-review-queue': 9 },
              failedByReason: {},
            } as unknown as DeliveryLanes
          }
        />
      </div>
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Degraded')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
