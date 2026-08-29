import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OvieMacHud } from '@/components/features/admin/hud/OvieMacHud';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';

const navigationMocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigationMocks.replace }),
}));

vi.mock('@/components/atoms/DesktopTitlebar', () => ({
  DesktopTitlebar: () => <div data-testid='electron-titlebar-row' />,
}));

const BASE: OvieMacHudSnapshot = {
  alive: {
    status: 'dead',
    cashUsd: 0,
    weeklyBurnUsd: 200,
    weeklyRevenueUsd: 0,
    weeklyRevenueGrowthRate: 0,
    reachesProfitBeforeZero: false,
    detail: '$0 revenue with burn is default dead.',
    available: true,
  },
  growth: {
    rate: 0,
    source: 'active-users',
    ycBar: 'not-figured-out',
    thisWeek: 0,
    lastWeek: 0,
    available: true,
    showChart: false,
  },
  shipping: {
    shipsThisWeek: 0,
    available: true,
    detail: 'Merges without receipts do not count.',
  },
  generatedAtIso: '2026-08-22T00:00:00.000Z',
};

describe('OvieMacHud', () => {
  it('renders exactly the three YC metrics and no fake P&L or chart', () => {
    const { container } = render(<OvieMacHud snapshot={BASE} />);
    expect(screen.getByTestId('ovie-mac-hud-alive')).toHaveTextContent(
      'Default dead'
    );
    expect(screen.getByTestId('ovie-mac-hud-alive')).toHaveTextContent('Cash');
    expect(screen.getByTestId('ovie-mac-hud-growth')).toHaveTextContent('0%');
    expect(screen.getByTestId('ovie-mac-hud-shipping')).toHaveTextContent('0');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /P&L|signups?|downloads?|pageviews?/i
    );
    expect(screen.getAllByTestId(/ovie-mac-hud-/)).toHaveLength(3);
  });

  it('keeps the three-card grid reserved when numbers are unavailable', () => {
    render(
      <OvieMacHud
        snapshot={{
          ...BASE,
          alive: {
            ...BASE.alive,
            status: 'unknown',
            cashUsd: null,
            weeklyBurnUsd: null,
            weeklyRevenueUsd: null,
            available: false,
          },
          growth: { ...BASE.growth, available: false },
          shipping: { ...BASE.shipping, available: false },
        }}
      />
    );
    expect(screen.getByTestId('ovie-mac-hud-alive')).toHaveTextContent(
      '\u2014'
    );
    expect(screen.getByTestId('ovie-mac-hud-growth')).toHaveTextContent(
      '\u2014'
    );
    expect(screen.getByTestId('ovie-mac-hud-shipping')).toHaveTextContent(
      '\u2014'
    );
  });

  it('keeps the unavailable state truthful with a named recovery and escape', () => {
    render(
      <OvieMacHud
        snapshot={{
          ...BASE,
          alive: {
            ...BASE.alive,
            status: 'unknown',
            cashUsd: null,
            weeklyBurnUsd: null,
            weeklyRevenueUsd: null,
            reachesProfitBeforeZero: null,
            detail:
              'Cash, burn, or revenue inputs are unavailable. Reload Jovie to retry.',
            available: false,
          },
          growth: { ...BASE.growth, available: false },
          shipping: {
            ...BASE.shipping,
            available: false,
            detail: 'Shipping receipts are unavailable. Reload Jovie to retry.',
          },
        }}
      />
    );

    expect(screen.getByRole('link', { name: 'Back to Jovie' })).toHaveAttribute(
      'href',
      '/app/chat'
    );
    expect(screen.queryByTestId('electron-titlebar-row')).toBeNull();
    expect(screen.getByTestId('ovie-mac-refresh-receipt')).toHaveTextContent(
      'Updated 00:00:00 UTC'
    );
    const growth = screen.getByTestId('ovie-mac-hud-growth');
    expect(within(growth).getAllByText('\u2014')).toHaveLength(2);
    expect(growth).not.toHaveTextContent(/Active Users0/);
    expect(growth).not.toHaveTextContent('1% means not figured out');
    expect(growth).toHaveTextContent(/unavailable.*reload jovie/i);
  });

  it('enters and exits fullscreen on the same in-shell route', () => {
    window.history.replaceState(
      {},
      '',
      '/app/ov/ops?ovie=mac&runtime=electron'
    );
    const { rerender } = render(<OvieMacHud snapshot={BASE} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(navigationMocks.replace).toHaveBeenLastCalledWith(
      '/app/ov/ops?ovie=mac&runtime=electron&fs=1',
      { scroll: false }
    );

    window.history.replaceState(
      {},
      '',
      '/app/ov/ops?ovie=mac&runtime=electron&fs=1'
    );
    rerender(<OvieMacHud snapshot={BASE} fullscreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(navigationMocks.replace).toHaveBeenLastCalledWith(
      '/app/ov/ops?ovie=mac&runtime=electron',
      { scroll: false }
    );
  });
});
