import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DailyBucket,
  ShippingVelocityResponse,
} from '@/app/api/admin/hud/shipping-velocity/route';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { HudMetrics } from '@/types/hud';
import { HudKpiSubgrid } from './HudKpiSubgrid';

const metrics = {
  aiOps: {
    counts: { running: 1234, queued: 5, review: 2 },
    mergeQueue: { openAgentPrs: 4, openAgentPrThreshold: 12 },
  },
} as unknown as HudMetrics;

/** 14 days: prior week merges 2/day at 4h, last week 3/day at 2h. */
function twoWeeks(): DailyBucket[] {
  return Array.from({ length: 14 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    merged: index < 7 ? 2 : 3,
    opened: 4,
    closed: 0,
    mergeP50Hours: index < 7 ? 4 : 2,
  }));
}

function payload(
  data: DailyBucket[],
  observation: ShippingVelocityResponse['observation'] = 'fresh'
): ShippingVelocityResponse {
  return {
    data,
    range: '30d',
    cachedAt: '2026-09-14T12:00:00.000Z',
    observation,
  };
}

function renderGrid() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HudKpiSubgrid metrics={metrics} />
    </QueryClientProvider>
  );
}

function stubFetch(answer: () => Promise<Response>) {
  const fetchMock = vi.fn(answer);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HudKpiSubgrid', () => {
  it('holds dashes while velocity loads and shows agent counts, axe-clean', async () => {
    const fetchMock = stubFetch(() => new Promise<Response>(() => {}));
    const { container } = renderGrid();

    expect(screen.getByTestId('hud-kpi-ship-velocity')).toHaveTextContent('—');
    expect(screen.getByTestId('hud-kpi-merge-time')).toHaveTextContent('—');
    const agents = screen.getByTestId('hud-kpi-active-agents');
    expect(agents).toHaveTextContent('1,234');
    expect(agents).toHaveTextContent('Queued 5 | Review 2');
    expect(agents).toHaveTextContent('4 / 12 agent PRs open');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/hud/shipping-velocity?range=30d',
      expect.objectContaining({ cache: 'no-store' })
    );
    await expectNoA11yViolations(container);
  });

  it('shows 7-day velocity, merge time and deltas once loaded, axe-clean', async () => {
    stubFetch(async () => Response.json(payload(twoWeeks())));
    const { container } = renderGrid();

    const velocity = screen.getByTestId('hud-kpi-ship-velocity');
    await waitFor(() => expect(velocity).toHaveTextContent('21'));
    expect(velocity).toHaveTextContent('PRs merged, last 7d');
    expect(velocity).toHaveTextContent('Up 50.0% vs prior 7d');
    const mergeTime = screen.getByTestId('hud-kpi-merge-time');
    expect(mergeTime).toHaveTextContent('2.0h');
    expect(mergeTime).toHaveTextContent('Down 50.0% vs prior 7d');
    await expectNoA11yViolations(container);
  });

  it('preserves missing and measured-zero days in both the trend and UTC details', async () => {
    const days = twoWeeks();
    days[8] = { ...days[8]!, merged: 0, mergeP50Hours: null };
    days[9] = { ...days[9]!, mergeP50Hours: 0 };
    days[10] = { ...days[10]!, mergeP50Hours: 1.2345 };
    stubFetch(async () => Response.json(payload(days, 'stale')));
    const { container } = renderGrid();

    const chart = await screen.findByRole('img', {
      name: /Daily median hours to merge/i,
    });
    const path = chart.querySelector('path')?.getAttribute('d');
    expect(path?.match(/M/g)).toHaveLength(2);
    fireEvent.click(screen.getByText('Daily Shipping Data · Cached'));
    const table = screen.getByRole('table', {
      name: /GitHub.*2026-09-14 12:00 UTC/,
    });
    expect(within(table).getAllByRole('row')).toHaveLength(15);
    const missing = within(table).getByRole('row', { name: /2026-09-09/ });
    expect(within(missing).getByText('0')).toBeInTheDocument();
    expect(within(missing).getByText('Not measured')).toBeInTheDocument();
    expect(
      within(table).getByRole('row', { name: /2026-09-10/ })
    ).toHaveTextContent(/0$/);
    expect(within(table).getByText('1.2345')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('omits the percentage comparison when the prior week is incomplete', async () => {
    stubFetch(async () => Response.json(payload(twoWeeks().slice(1))));
    renderGrid();

    const velocity = screen.getByTestId('hud-kpi-ship-velocity');
    await waitFor(() => expect(velocity).toHaveTextContent('21'));
    expect(velocity).toHaveTextContent('— vs prior 7d');
    expect(screen.getByTestId('hud-kpi-merge-time')).toHaveTextContent(
      '— vs prior 7d'
    );
  });

  it('shows zero merges for a successful empty observation, axe-clean', async () => {
    stubFetch(async () => Response.json(payload([], 'empty')));
    const { container } = renderGrid();

    const velocity = screen.getByTestId('hud-kpi-ship-velocity');
    await waitFor(() => expect(velocity).toHaveTextContent('0'));
    expect(velocity).toHaveTextContent('— vs prior 7d');
    expect(screen.getByTestId('hud-kpi-merge-time')).toHaveTextContent('—');
    await expectNoA11yViolations(container);
  });

  it('keeps dashes when the source is unavailable or the request fails', async () => {
    const fetchMock = stubFetch(async () =>
      Response.json(payload(twoWeeks(), 'unavailable'))
    );
    const first = renderGrid();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Daily Shipping Data'));
    await screen.findByText('Shipping data unavailable.');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByTestId('hud-kpi-ship-velocity')).not.toHaveTextContent(
      '50.0%'
    );
    expect(screen.getByTestId('hud-kpi-ship-velocity')).not.toHaveTextContent(
      '21'
    );
    expect(screen.getByTestId('hud-kpi-merge-time')).toHaveTextContent('—');
    first.unmount();

    stubFetch(async () => new Response('nope', { status: 500 }));
    const { container } = renderGrid();
    await waitFor(() =>
      expect(screen.getByTestId('hud-kpi-ship-velocity')).toHaveTextContent(
        '— vs prior 7d'
      )
    );
    await expectNoA11yViolations(container);
  });
});
