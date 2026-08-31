import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShippingVelocityChart } from '@/components/features/admin/ShippingVelocityChart';

const INITIAL_BUCKET = {
  date: '2026-08-20',
  merged: 1,
  opened: 2,
  closed: 0,
  mergeP50Hours: 3,
};

function velocityResponse(
  range: '7d' | '30d' | '1y',
  cachedAt = new Date().toISOString()
) {
  return new Response(
    JSON.stringify({
      data: [{ ...INITIAL_BUCKET, merged: range === '1y' ? 9 : 4 }],
      range,
      cachedAt,
      observation: 'fresh',
    }),
    { status: 200 }
  );
}

describe('ShippingVelocityChart observation states', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not treat not_configured as an empty zero period', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          range: '7d',
          cachedAt: new Date().toISOString(),
          observation: 'not_configured',
          errorMessage: 'GitHub is not configured for shipping velocity.',
        }),
        { status: 200 }
      )
    );

    render(<ShippingVelocityChart />);

    await waitFor(() => {
      expect(
        screen.getByTestId('hud-shipping-velocity-observation')
      ).toHaveAttribute('data-state', 'not_configured');
    });
    expect(screen.queryByText('No PRs in this period')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
  });

  it('shows empty only after a successful all-zero observation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              date: '2026-08-20',
              merged: 0,
              opened: 0,
              closed: 0,
              mergeP50Hours: null,
            },
          ],
          range: '7d',
          cachedAt: new Date().toISOString(),
          observation: 'empty',
        }),
        { status: 200 }
      )
    );

    render(<ShippingVelocityChart />);

    await waitFor(() => {
      expect(
        screen.getByTestId('hud-shipping-velocity-observation')
      ).toHaveAttribute('data-state', 'empty');
    });
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
  });

  it('shows unavailable with retry when the fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('github down', { status: 500 })
    );

    render(<ShippingVelocityChart />);

    await waitFor(() => {
      expect(
        screen.getByTestId('hud-shipping-velocity-observation')
      ).toHaveAttribute('data-state', 'unavailable');
    });
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('aborts a superseded range request and ignores its late response', async () => {
    const pending: Array<{
      resolve: (response: Response) => void;
      signal: AbortSignal | null;
    }> = [];
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>(resolve => {
          pending.push({ resolve, signal: init?.signal ?? null });
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ShippingVelocityChart
        initialData={[INITIAL_BUCKET]}
        initialRange='7d'
        cachedAt={new Date().toISOString()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '30D' }));
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: '1Y' }));
    await waitFor(() => expect(pending).toHaveLength(2));

    expect(pending[0]?.signal?.aborted).toBe(true);

    await act(async () => {
      pending[1]?.resolve(velocityResponse('1y', '2026-08-30T12:02:00.000Z'));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByTestId('shipping-velocity-freshness')
      ).toHaveTextContent('Showing 1Y')
    );

    await act(async () => {
      pending[0]?.resolve(velocityResponse('30d', '2026-08-30T12:03:00.000Z'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('shipping-velocity-freshness')).toHaveTextContent(
      'Showing 1Y'
    );
    expect(screen.getByRole('button', { name: '1Y' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('keeps the displayed range truthful when a new range fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('github down', { status: 500 }))
    );

    render(
      <ShippingVelocityChart
        initialData={[INITIAL_BUCKET]}
        initialRange='7d'
        cachedAt={new Date().toISOString()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '30D' }));

    await waitFor(() => {
      expect(
        screen.getByTestId('hud-shipping-velocity-observation')
      ).toHaveTextContent(
        'Showing last known 7D velocity. 30D refresh failed.'
      );
    });
    expect(screen.getByTestId('shipping-velocity-freshness')).toHaveTextContent(
      'Showing 7D'
    );
    expect(screen.getByRole('button', { name: '30D' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('shipping-velocity-status-slot')).toHaveClass(
      'min-h-14'
    );
  });

  it('names and summarizes the chart and exposes toggle state', () => {
    render(
      <ShippingVelocityChart
        initialData={[INITIAL_BUCKET]}
        initialRange='7d'
        cachedAt={new Date().toISOString()}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Shipping Velocity' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('shipping-velocity-figure')).toHaveAccessibleName(
      'Shipping Velocity'
    );
    expect(
      screen.getByTestId('shipping-velocity-figure')
    ).toHaveAccessibleDescription(
      '7D shipping velocity: 1 merged, 2 opened, and 0 closed without merge.'
    );

    const merged = screen.getByRole('button', {
      name: 'Toggle Merged Series Spotlight',
    });
    const opened = screen.getByRole('button', {
      name: 'Toggle Opened Series Spotlight',
    });
    const closed = screen.getByRole('button', {
      name: 'Toggle Closed Series Visibility',
    });
    expect(merged).toHaveAttribute('aria-pressed', 'false');
    expect(opened).toHaveAttribute('aria-pressed', 'false');
    expect(closed).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(merged);
    expect(merged).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(opened);
    expect(merged).toHaveAttribute('aria-pressed', 'false');
    expect(opened).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(closed);
    expect(closed).toHaveAttribute('aria-pressed', 'true');
  });

  it('labels a server stale fallback while retaining its verified data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ ...INITIAL_BUCKET, merged: 5 }],
            range: '30d',
            cachedAt: '2026-08-30T11:55:00.000Z',
            observation: 'stale',
            errorMessage:
              'Refresh unavailable; showing last verified shipping velocity.',
          }),
          { status: 200 }
        )
      )
    );

    render(
      <ShippingVelocityChart
        initialData={[INITIAL_BUCKET]}
        initialRange='7d'
        cachedAt={new Date().toISOString()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '30D' }));

    await waitFor(() =>
      expect(
        screen.getByTestId('hud-shipping-velocity-observation')
      ).toHaveTextContent(
        'Refresh unavailable; showing last verified shipping velocity.'
      )
    );
    expect(
      screen.getByTestId('hud-shipping-velocity-observation')
    ).toHaveTextContent('Stale');
    expect(screen.getByTestId('shipping-velocity-freshness')).toHaveTextContent(
      'Showing 30D'
    );
  });

  it('rejects an active response whose range does not match the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(velocityResponse('7d')));

    render(
      <ShippingVelocityChart
        initialData={[INITIAL_BUCKET]}
        initialRange='7d'
        cachedAt={new Date().toISOString()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '30D' }));

    await waitFor(() => {
      expect(
        screen.getByTestId('hud-shipping-velocity-observation')
      ).toHaveTextContent('Received 7d data while loading 30d');
    });
    expect(screen.getByTestId('shipping-velocity-freshness')).toHaveTextContent(
      'Showing 7D'
    );
    expect(screen.getByRole('button', { name: '30D' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('advances freshness age and marks two-minute-old data stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-30T12:00:00.000Z');
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ShippingVelocityChart
        initialData={[INITIAL_BUCKET]}
        initialRange='7d'
        cachedAt='2026-08-30T12:00:00.000Z'
      />
    );

    expect(screen.getByTestId('shipping-velocity-freshness')).toHaveTextContent(
      'Updated just now'
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByTestId('shipping-velocity-freshness')).toHaveTextContent(
      'Updated 1 min ago'
    );
    expect(
      screen.getByTestId('shipping-velocity-freshness')
    ).not.toHaveTextContent('Stale');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('shipping-velocity-freshness')).toHaveTextContent(
      'Updated 2 min ago · Stale'
    );
  });

  it('pauses automatic refresh while hidden and aborts the resumed request on cleanup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-30T12:00:00.000Z');
    let visibility: DocumentVisibilityState = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visibility
    );
    let resumedSignal: AbortSignal | null = null;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      resumedSignal = init?.signal ?? null;
      return new Promise<Response>(() => undefined);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(
      <ShippingVelocityChart
        initialData={[INITIAL_BUCKET]}
        initialRange='7d'
        cachedAt='2026-08-30T12:00:00.000Z'
      />
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    visibility = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('shipping-velocity-freshness')).toHaveTextContent(
      'Updated 4 min ago · Stale'
    );

    unmount();
    expect(resumedSignal?.aborted).toBe(true);
  });
});
