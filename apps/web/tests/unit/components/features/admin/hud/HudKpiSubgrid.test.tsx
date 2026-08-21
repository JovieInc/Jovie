import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HudKpiSubgrid } from '@/components/features/admin/hud/HudKpiSubgrid';
import type { HudMetrics } from '@/types/hud';

const metrics = {
  aiOps: {
    counts: {
      running: 2,
      queued: 1,
      review: 3,
      blocked: 0,
      done: 0,
      failed: 0,
      stale: 0,
    },
    mergeQueue: {
      openAgentPrs: 1,
      openAgentPrThreshold: 5,
      pressure: 'normal',
    },
  },
} as HudMetrics;

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return {
    client,
    ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>),
  };
}

function makeVelocityPayload(observation: 'fresh' | 'not_configured') {
  return {
    data: Array.from({ length: 14 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      merged: index >= 7 ? 2 : 1,
      opened: 0,
      closed: 0,
      mergeP50Hours: 2,
    })),
    range: '30d' as const,
    cachedAt: new Date().toISOString(),
    observation,
  };
}

describe('HudKpiSubgrid', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps last known ship velocity after a refetch error', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify(makeVelocityPayload('fresh')), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(new Response('github down', { status: 500 }));

    const { client } = renderWithQuery(<HudKpiSubgrid metrics={metrics} />);

    await waitFor(() => {
      expect(screen.getByTestId('hud-kpi-ship-velocity')).toHaveTextContent(
        '14'
      );
    });

    await client.invalidateQueries({
      queryKey: ['hud', 'kpi', 'shipping-velocity'],
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByTestId('hud-kpi-ship-velocity')).toHaveTextContent('14');
    expect(screen.getByTestId('hud-kpi-merge-time')).toHaveTextContent('2.0h');
  });

  it('does not show zero velocity when GitHub is not configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          range: '30d',
          cachedAt: new Date().toISOString(),
          observation: 'not_configured',
          errorMessage: 'GitHub is not configured for shipping velocity.',
        }),
        { status: 200 }
      )
    );

    renderWithQuery(<HudKpiSubgrid metrics={metrics} />);

    await waitFor(() => {
      expect(screen.getByTestId('hud-kpi-ship-velocity')).toHaveTextContent(
        '—'
      );
    });
    expect(screen.getByTestId('hud-kpi-merge-time')).toHaveTextContent('—');
  });
});
