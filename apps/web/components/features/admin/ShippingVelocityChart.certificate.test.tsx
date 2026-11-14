import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ShippingVelocityChart } from './ShippingVelocityChart';

vi.mock('next/dynamic', () => ({
  default: () =>
    function VelocityCanvas(props: {
      data: unknown[];
      spotlight: string | null;
      showClosed: boolean;
      onChartClick: () => void;
    }) {
      return (
        <div
          data-testid='velocity-canvas'
          data-rows={props.data.length}
          data-spotlight={props.spotlight ?? 'none'}
          data-closed={String(props.showClosed)}
        >
          <button type='button' onClick={props.onChartClick}>
            Chart background
          </button>
        </div>
      );
    },
}));

const fetchMock = vi.fn<typeof fetch>();
const day = (date: string, merged: number) => ({
  date,
  merged,
  opened: merged + 2,
  closed: 1,
});
const week = [day('2026-08-24', 3), day('2026-08-25', 5)];
const ok = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('ShippingVelocityChart certificate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('spotlights a series from the legend and clears it from the chart', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ShippingVelocityChart initialData={week} initialRange='7d' />
    );

    const canvas = screen.getByTestId('velocity-canvas');
    const merged = screen.getByRole('button', {
      name: 'Toggle Merged Series Spotlight',
    });
    await user.click(merged);
    expect(merged).toHaveAttribute('aria-pressed', 'true');
    expect(canvas).toHaveAttribute('data-spotlight', 'merged');

    await user.click(
      screen.getByRole('button', { name: 'Toggle Opened Series Spotlight' })
    );
    expect(canvas).toHaveAttribute('data-spotlight', 'opened');

    await user.click(screen.getByRole('button', { name: 'Chart background' }));
    expect(canvas).toHaveAttribute('data-spotlight', 'none');

    await user.click(
      screen.getByRole('button', { name: 'Toggle Closed Series Visibility' })
    );
    expect(canvas).toHaveAttribute('data-closed', 'true');
    expect(
      screen.getByText(
        '7D shipping velocity: 8 merged, 12 opened, and 2 closed without merge.'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('loads a new range when its toggle is pressed', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(() =>
      ok({
        data: [day('2026-08-01', 9)],
        range: '30d',
        cachedAt: new Date().toISOString(),
        observation: 'fresh',
      })
    );
    render(<ShippingVelocityChart initialData={week} initialRange='7d' />);

    await user.click(screen.getByRole('button', { name: '30D' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/hud/shipping-velocity?range=30d',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(await screen.findByTestId('velocity-canvas')).toHaveAttribute(
      'data-rows',
      '1'
    );
    expect(screen.getByRole('button', { name: '30D' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('keeps the last known chart with a retry when a refresh fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response('{}', { status: 502 }))
    );
    const { container } = render(
      <ShippingVelocityChart initialData={week} initialRange='7d' />
    );

    await user.click(screen.getByRole('button', { name: '1Y' }));
    expect(
      await screen.findByText(
        'Showing last known 7D velocity. 1Y refresh failed. Failed to fetch (502)'
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('velocity-canvas')).toHaveAttribute(
      'data-rows',
      '2'
    );

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('shows a skeleton, then the failure and a retry, on a first read', async () => {
    let fail: (reason: unknown) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((_, reject) => {
          fail = reject;
        })
    );
    const { container } = render(<ShippingVelocityChart />);

    expect(screen.getByTestId('shipping-velocity-loading')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    fail(new TypeError('Failed to fetch'));
    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
    expect(screen.queryByTestId('velocity-canvas')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps empty and RTL observations axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ShippingVelocityChart initialData={[]} initialRange='7d' />
      </div>
    );

    expect(
      screen.getByText(/No Pull Requests in this period/)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('velocity-canvas')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
