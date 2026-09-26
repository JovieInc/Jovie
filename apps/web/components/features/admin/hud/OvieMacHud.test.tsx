import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';
import { OvieMacHud } from './OvieMacHud';

vi.mock('@/components/atoms/DesktopTitlebar', () => ({
  DesktopTitlebar: () => <div data-testid='desktop-titlebar' />,
}));

vi.mock('@/components/features/admin/design-lab', () => ({
  DesignProposalReviewPanel: () => null,
}));

vi.mock('./OperationalTasksPanel', () => ({
  OperationalTasksPanel: () => null,
}));

vi.mock('./OvieLauncherRail', () => ({
  OvieLauncherRail: () => null,
}));

vi.mock('./SymphonyCodexAccountControl', () => ({
  SymphonyCodexAccountControl: () => null,
}));

vi.mock('./OvieActivityFeed', () => ({
  OvieActivityFeed: () => null,
}));

const snapshot: OvieMacHudSnapshot = {
  alive: {
    cashUsd: null,
    weeklyBurnUsd: null,
    weeklyRevenueUsd: null,
    weeklyRevenueGrowthRate: null,
    available: false,
    status: 'unknown',
    reachesProfitBeforeZero: null,
    detail: '',
  },
  growth: {
    rate: 0,
    source: 'revenue',
    ycBar: 'not-figured-out',
    thisWeek: 0,
    lastWeek: 0,
    available: false,
    showChart: false,
  },
  shipping: {
    shipsThisWeek: 0,
    available: false,
    detail: '',
  },
  inFlightPullRequests: {
    availability: 'not_configured',
    totalOpen: 0,
    items: [],
    truncated: false,
    errorMessage: null,
  },
  activityFeed: {
    availability: 'available',
    truncated: false,
    rows: [],
  },
  generatedAtIso: '2026-09-16T00:00:00.000Z',
};

describe('OvieMacHud', () => {
  it('exposes a visible Close control back to the canonical shell', () => {
    render(<OvieMacHud snapshot={snapshot} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
