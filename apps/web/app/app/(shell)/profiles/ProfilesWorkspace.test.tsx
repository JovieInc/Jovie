import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type { ProfilesWorkspaceData } from './data';
import { ProfilesWorkspace } from './ProfilesWorkspace';

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: vi.fn(),
}));

const data: ProfilesWorkspaceData = {
  artist: {
    name: 'Tim White',
    username: 'tim',
    avatarUrl: null,
  },
  rows: [
    {
      id: 'jovie',
      rowType: 'surface',
      kind: 'jovie',
      platform: 'jovie',
      label: 'Jovie Profile',
      handle: '@tim',
      url: 'https://jov.ie/tim',
      trackedUrl: null,
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'active',
      rank: 2,
      previousRank: 4,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
      primaryIssue: 'No issues',
      primaryAction: 'open',
    },
    {
      id: 'spotify',
      rowType: 'surface',
      kind: 'dsp',
      platform: 'spotify',
      label: 'Spotify',
      handle: 'Tim White',
      url: 'https://open.spotify.com/artist/tim',
      trackedUrl: 'https://jov.ie/tim/s/spotify',
      qualificationStatus: 'qualified',
      isOfficial: true,
      monitoringState: 'locked',
      rank: 7,
      previousRank: 9,
      lastObservedAt: '2026-07-16T00:00:00.000Z',
      primaryIssue: 'Monitoring limit',
      primaryAction: 'upgrade',
    },
    {
      id: 'gmail',
      rowType: 'connector',
      kind: 'connector',
      platform: 'gmail',
      label: 'Gmail',
      handle: 'tim@example.com',
      url: '/app/settings/connectors',
      status: 'connected',
      monitoringState: 'active',
      primaryIssue: 'Active',
      primaryAction: 'open',
    },
  ],
  monitoringLimit: 5,
  monitoredCount: 1,
  qualifiedShare: 0.5,
  bestJovieRank: 2,
  lastObservedAt: '2026-07-16T00:00:00.000Z',
  providerAvailable: true,
};

function renderWorkspace(workspaceData: ProfilesWorkspaceData | null) {
  return render(
    <TooltipProvider>
      <ProfilesWorkspace data={workspaceData} />
    </TooltipProvider>
  );
}

describe('ProfilesWorkspace', () => {
  it('uses the canonical empty state with a direct artist-profile action', () => {
    renderWorkspace(null);

    expect(
      screen.getByTestId('profiles-workspace-empty-state')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'No Artist Profile Selected' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Set Up Artist Profile' })
    ).toHaveAttribute('href', '/app/settings/artist-profile');
  });

  it('renders a connection summary and filters without exposing locked ranks', () => {
    renderWorkspace(data);

    expect(vi.mocked(useRegisterRightPanel)).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Jovie Profile')).toBeInTheDocument();
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(screen.getByText('3 Connections')).toBeInTheDocument();
    expect(screen.getByText('Monitored 1/5')).toBeInTheDocument();
    expect(screen.getByText('Needs Attention 1')).toBeInTheDocument();
    expect(screen.getByText('Monitoring Active')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'DSP connection type' })
    ).toBeInTheDocument();
    expect(screen.getByText('Requires Upgrade')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'DSPs' }));
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.queryByText('Jovie Profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('opens connection-specific details from the row action', () => {
    renderWorkspace(data);

    const action = screen.getByRole('button', {
      name: 'Actions for Spotify',
    });
    expect(action.parentElement).toHaveClass('sm:opacity-0');

    fireEvent.click(action);
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(
      screen.getByRole('complementary', { name: 'Connection details' })
    ).toBeInTheDocument();
    expect(screen.getByText('Next Best Action')).toBeInTheDocument();
    expect(
      screen.getByText('Upgrade the monitoring limit to track this connection.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/app/settings/billing'
    );
  });

  it('preserves the compact mobile table contract', () => {
    renderWorkspace(data);

    expect(screen.getByRole('columnheader', { name: 'Rank' })).toHaveClass(
      'max-md:hidden'
    );
    expect(screen.getByRole('columnheader', { name: 'Change' })).toHaveClass(
      'max-lg:hidden'
    );
    expect(
      screen.getByRole('columnheader', { name: 'Monitoring' })
    ).toHaveClass('max-xl:hidden');
    expect(screen.getByText('tim@example.com')).toHaveClass('max-sm:hidden');

    const summary = screen.getByTestId('connections-summary');
    expect(summary.parentElement).toHaveClass('overflow-x-auto');
    expect(screen.getByText('Best Rank #2')).toHaveClass('max-sm:hidden');
    expect(screen.getByText('Monitoring Active')).toHaveClass('max-sm:hidden');
  });
});
