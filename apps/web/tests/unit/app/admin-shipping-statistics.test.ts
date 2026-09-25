import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { type ButtonHTMLAttributes, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@jovie/ui', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) =>
    createElement(
      'button',
      { ...props, type: props.type ?? 'button' },
      children
    ),
}));
vi.mock('@/components/features/admin/ShippingVelocityChart', () => ({
  ShippingVelocityChart: () =>
    createElement('div', { 'data-testid': 'shipping-velocity-chart' }),
}));

import {
  pipelineRows,
  ShippingStatistics,
} from '@/app/app/(shell)/admin/shipping/ShippingStatistics';
import { unknownProjection } from '@/lib/ovie/shipping-state';
import { parseShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';

const OBSERVED_AT = new Date(Date.now() - 1_000).toISOString();
const FRESH_UNTIL = new Date(Date.now() + 10_000).toISOString();

function projectionWithCounts() {
  const projection = structuredClone(
    unknownProjection({
      sequence: 1,
      observationTimestamp: OBSERVED_AT,
      emissionTimestamp: OBSERVED_AT,
      latencyMs: 10,
      publishing: true,
      lastError: null,
    })
  );
  const runtime = projection.sources['symphony-runtime'];
  Object.assign(runtime, {
    state: 'fresh',
    freshnessDeadline: FRESH_UNTIL,
    sourceTimestamp: OBSERVED_AT,
    counts: {
      ...runtime.counts,
      running: { state: 'measured-nonzero', value: 3 },
      retrying: { state: 'measured-zero', value: 0 },
      blocked: { state: 'measured-nonzero', value: 2 },
    },
  });

  const queue = projection.sources['github-native-merge-queue'];
  Object.assign(queue, {
    state: 'fresh',
    freshnessDeadline: FRESH_UNTIL,
    sourceTimestamp: OBSERVED_AT,
    counts: {
      ...queue.counts,
      queued: { state: 'measured-zero', value: 0 },
      openPullRequests: { state: 'measured-nonzero', value: 7 },
    },
  });

  Object.assign(projection, {
    state: 'fresh',
    freshnessDeadline: FRESH_UNTIL,
  });

  return parseShippingCockpitProjection(projection);
}

function renderStatistics() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(ShippingStatistics)
    )
  );
}

describe('pipelineRows', () => {
  it('maps fresh source measurements and preserves measured zero', () => {
    const rows = pipelineRows(
      projectionWithCounts() ?? undefined,
      Date.parse(OBSERVED_AT) + 5_000
    );

    expect(rows).toMatchObject([
      { label: 'Running', value: 3, state: 'fresh' },
      { label: 'Retrying', value: 0, state: 'fresh' },
      { label: 'Blocked', value: 2, state: 'fresh' },
      { label: 'Open Pull Requests', value: 7, state: 'fresh' },
      { label: 'Native merge queue', value: 0, state: 'fresh' },
    ]);
  });

  it('fails closed to UNKNOWN when a source has no authoritative observation', () => {
    const rows = pipelineRows(
      parseShippingCockpitProjection(
        unknownProjection({
          sequence: 1,
          observationTimestamp: OBSERVED_AT,
          emissionTimestamp: OBSERVED_AT,
          latencyMs: 10,
          publishing: true,
          lastError: null,
        })
      ) ?? undefined,
      Date.parse(OBSERVED_AT) + 5_000
    );

    expect(rows.every(row => row.value === null)).toBe(true);
    expect(rows.every(row => row.state === 'UNKNOWN')).toBe(true);
    expect(rows.every(row => row.timestamp === 'UNKNOWN')).toBe(true);
  });

  it('does not display retained counts after their freshness deadline', () => {
    const projection = projectionWithCounts();
    const rows = pipelineRows(
      projection ?? undefined,
      Date.parse(FRESH_UNTIL) + 1
    );

    expect(rows[0]).toMatchObject({
      value: null,
      state: 'stale / unavailable',
      timestamp: OBSERVED_AT,
    });
    expect(rows[3]).toMatchObject({
      value: null,
      state: 'stale / unavailable',
    });
  });
});

describe('ShippingStatistics states', () => {
  it('renders a retryable UNKNOWN state after the shipping receipt fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(projectionWithCounts()), { status: 200 })
      );

    renderStatistics();

    await waitFor(() =>
      expect(
        screen.getByText('UNKNOWN — observation failed. Refresh to retry.')
      ).toBeInTheDocument()
    );
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);

    screen.getByRole('button', { name: 'Refresh pipeline' }).click();

    await waitFor(() => expect(screen.getByText(/Fresh/)).toBeInTheDocument());
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  }, 15_000);

  it('keeps stale receipts visible as context while withholding stale counts', async () => {
    const stale = projectionWithCounts();
    const stalePayload = stale ? structuredClone(stale) : stale;
    if (stalePayload) {
      Object.assign(stalePayload, {
        state: 'stale',
        freshnessDeadline: OBSERVED_AT,
      });
      for (const source of Object.values(stalePayload.sources)) {
        Object.assign(source, { freshnessDeadline: OBSERVED_AT });
      }
    }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(stalePayload), { status: 200 })
    );

    renderStatistics();

    await waitFor(() =>
      expect(screen.getByText(/Stale or partial/)).toBeInTheDocument()
    );
    expect(screen.getAllByText('stale / unavailable').length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText('UNKNOWN').length).toBeGreaterThan(0);
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });
});
