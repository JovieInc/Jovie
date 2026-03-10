import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PlatformStatsStrip } from '@/components/admin/PlatformStatsStrip';
import type { AdminPlatformStats } from '@/lib/admin/platform-stats';

const baseStats: AdminPlatformStats = {
  labelsOnPlatform: 36,
  labelBadges: ['Armada', 'Black Hole', 'Monstercat'],
  allLabelsAndDistributors: ['Armada', 'Black Hole', 'Monstercat'],
  totalUniqueVisitors: 1200,
  dspClicksDriven: 950,
  contactsCaptured: 110,
  creatorsOnPlatform: 64,
  releasesTracked: 523,
  tracksTracked: 1742,
};

describe('PlatformStatsStrip', () => {
  it('renders platform-wide bragging metrics', () => {
    render(
      <TooltipProvider>
        <PlatformStatsStrip stats={baseStats} />
      </TooltipProvider>
    );

    expect(screen.getByText('Labels on platform')).toBeInTheDocument();
    expect(screen.getByText('36')).toBeInTheDocument();
    expect(screen.getByText('Total unique visitors')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('DSP clicks driven')).toBeInTheDocument();
    expect(screen.getByText('950')).toBeInTheDocument();
    expect(screen.getByText('Contacts captured')).toBeInTheDocument();
    expect(screen.getByText('110')).toBeInTheDocument();
    expect(screen.getByText('Tracks tracked')).toBeInTheDocument();
    expect(screen.getByText('1,742')).toBeInTheDocument();
  });

  it('shows investor-facing label usage copy', () => {
    render(
      <TooltipProvider>
        <PlatformStatsStrip stats={baseStats} />
      </TooltipProvider>
    );

    expect(
      screen.getByText('Used by artists on Armada, Black Hole, and 34 others')
    ).toBeInTheDocument();
    expect(screen.getByText('+33')).toBeInTheDocument();
  });
});
