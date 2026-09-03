import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OvieMacHud } from '@/components/features/admin/hud/OvieMacHud';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';

vi.mock('@/components/atoms/DesktopTitlebar', () => ({
  DesktopTitlebar: () => <div data-testid='electron-titlebar-row' />,
}));

vi.mock('@/components/features/admin/hud/OvieLauncherRail', () => ({
  OvieLauncherRail: () => <div data-testid='ovie-launcher-rail' />,
}));

vi.mock('@/components/features/admin/design-lab', () => ({
  DesignProposalReviewPanel: () => (
    <div data-testid='ovie-taste-inbox'>Taste Inbox</div>
  ),
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
    expect(screen.getByTestId('ovie-launcher-rail')).toBeInTheDocument();
    expect(screen.getByTestId('ovie-taste-inbox')).toHaveTextContent(
      'Taste Inbox'
    );
    expect(
      screen.getByRole('link', { name: 'Talk To Summer' })
    ).toHaveAttribute('href', '/app/ov/chat');
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
});
