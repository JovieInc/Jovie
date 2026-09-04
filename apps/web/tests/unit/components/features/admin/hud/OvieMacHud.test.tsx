import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OvieMacHud } from '@/components/features/admin/hud/OvieMacHud';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';

vi.mock('@/components/atoms/DesktopTitlebar', () => ({
  DesktopTitlebar: () => <div data-testid='electron-titlebar-row' />,
}));

vi.mock('@/components/features/admin/hud/OvieLauncherRail', () => ({
  OvieLauncherRail: () => <div data-testid='ovie-launcher-rail' />,
}));

vi.mock('@/components/features/admin/hud/SymphonyCodexAccountControl', () => ({
  SymphonyCodexAccountControl: () => (
    <div data-testid='ovie-codex-account-control'>Codex Accounts</div>
  ),
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
  inFlightPullRequests: {
    availability: 'available',
    totalOpen: 4,
    truncated: true,
    errorMessage: null,
    items: [
      {
        number: 16886,
        title: 'feat(eve): bind signed Summer shadow ingress',
        url: 'https://github.com/JovieInc/Jovie/pull/16886',
        headRefName: 'tim/jov-16886',
        authorLogin: 'itstimwhite',
        updatedAtIso: '2026-08-22T00:00:00.000Z',
        status: 'merge_queue',
        statusLabel: 'MQ',
        statusDetail: 'Position 1',
        mergeQueuePosition: 1,
      },
      {
        number: 16927,
        title: 'fix(hud): show review status',
        url: 'https://github.com/JovieInc/Jovie/pull/16927',
        headRefName: 'tim/jov-16927',
        authorLogin: 'codex',
        updatedAtIso: '2026-08-22T01:00:00.000Z',
        status: 'in_review',
        statusLabel: 'In Review',
        statusDetail: 'Review requested',
        mergeQueuePosition: null,
      },
    ],
  },
  generatedAtIso: '2026-08-22T00:00:00.000Z',
};

describe('OvieMacHud', () => {
  it('renders the three YC metrics with the in-flight PR list', () => {
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
    expect(
      screen.getAllByTestId(/ovie-mac-hud-(alive|growth|shipping)$/)
    ).toHaveLength(3);

    const panel = screen.getByTestId('ovie-mac-hud-inflight-prs');
    expect(panel).toHaveTextContent('In-flight PRs');
    expect(panel).toHaveTextContent('2 / 4 Open');
    expect(panel).toHaveTextContent('MQ');
    expect(panel).toHaveTextContent('In Review');
    expect(panel).toHaveTextContent('tim/jov-16886 · Position 1');
    expect(
      within(panel).getByRole('link', { name: /#16886/i })
    ).toHaveAttribute('href', 'https://github.com/JovieInc/Jovie/pull/16886');
    expect(screen.getByTestId('ovie-launcher-rail')).toBeInTheDocument();
    expect(screen.getByTestId('ovie-codex-account-control')).toHaveTextContent(
      'Codex Accounts'
    );
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

  it('renders a stable error state when the PR signal fails closed', () => {
    render(
      <OvieMacHud
        snapshot={{
          ...BASE,
          inFlightPullRequests: {
            availability: 'error',
            totalOpen: 0,
            truncated: false,
            errorMessage: 'GitHub API error (502)',
            items: [],
          },
        }}
      />
    );

    const panel = screen.getByTestId('ovie-mac-hud-inflight-prs');
    expect(panel).toHaveTextContent('Signal Error');
    expect(panel).toHaveTextContent('GitHub API error (502)');
  });
});
