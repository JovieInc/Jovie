import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShippingVelocityChart } from '@/components/features/admin/ShippingVelocityChart';

describe('ShippingVelocityChart observation states', () => {
  afterEach(() => {
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
});
