import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
    expect(velocity).toHaveTextContent('↑ 50.0% vs prior 7d');
    const mergeTime = screen.getByTestId('hud-kpi-merge-time');
    expect(mergeTime).toHaveTextContent('2.0h');
    expect(mergeTime).toHaveTextContent('↓ 50.0% vs prior 7d');
    await expectNoA11yViolations(container);
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
    await waitFor(() =>
      expect(screen.getByTestId('hud-kpi-ship-velocity')).toHaveTextContent(
        '↑ 50.0%'
      )
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
