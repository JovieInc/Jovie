import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders a connection summary and filters without exposing locked ranks', async () => {
    renderWorkspace(data);

    expect(vi.mocked(useRegisterRightPanel)).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Jovie Profile')).toBeInTheDocument();
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(screen.getByText('3 Connections')).toBeInTheDocument();
    expect(screen.getByText('Monitored 1/5')).toBeInTheDocument();
    expect(screen.getByText('Needs Attention 1')).toBeInTheDocument();
    expect(screen.getByText('Monitoring Active')).toBeInTheDocument();
    const typeGlyph = screen.getByRole('img', {
      name: 'DSP connection type',
    });
    expect(typeGlyph).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'DSP connection type' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add Connection' })
    ).toBeInTheDocument();
    expect(screen.getByText('Requires Upgrade')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'DSPs' }));
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.queryByText('Jovie Profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('uses the row action registry to open connection-specific details', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    const action = screen.getByRole('button', {
      name: 'Actions for Spotify',
    });

    await user.click(action);
    await user.click(screen.getByRole('menuitem', { name: /View Details/i }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(
      screen.getByRole('complementary', { name: 'Connection details' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('profiles-rail-entity-header')).toHaveClass(
      'relative',
      'flex'
    );
    expect(screen.getByTestId('profiles-rail-summary')).toBeInTheDocument();
    expect(
      screen.getByTestId('profiles-rail-shareable-link')
    ).toHaveTextContent('jov.ie/tim/s/spotify');
    expect(screen.getByText('Next Best Action')).toBeInTheDocument();
    expect(
      screen.getByText('Upgrade the monitoring limit to track this connection.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upgrade' })).toHaveAttribute(
      'href',
      '/app/settings/billing'
    );
  });

  it('clears connection details when the table filter changes', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    await user.click(
      screen.getByRole('button', { name: 'Actions for Spotify' })
    );
    await user.click(screen.getByRole('menuitem', { name: /View Details/i }));
    expect(
      vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0]
    ).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(vi.mocked(useRegisterRightPanel)).toHaveBeenLastCalledWith(null);
  });

  it('opens the in-flow add rail with registry-backed services and canonical URL review', async () => {
    const user = userEvent.setup();
    renderWorkspace(data);

    await user.click(screen.getByRole('button', { name: 'Add Connection' }));
    const panel = vi.mocked(useRegisterRightPanel).mock.calls.at(-1)?.[0];
    expect(panel).not.toBeNull();

    render(<TooltipProvider>{panel as ReactElement}</TooltipProvider>);
    expect(
      screen.getByRole('complementary', { name: 'Add connection' })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Connect services/i }));
    expect(
      screen.getByRole('button', {
        name: 'Gmail Scan booking emails for tour confirmation signals.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Google Calendar/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(
      screen.getByRole('button', { name: /Add public profile/i })
    );
    const url = screen.getByRole('textbox', { name: 'Public profile URL' });
    await user.type(url, 'https://www.instagram.com/tim/?utm_source=test');
    expect(screen.getByText(/instagram\.com\/tim/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Review profile' })
    ).toBeEnabled();
  });

  it('keeps the single Add connection action in bounds at the 670px toolbar contract', () => {
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

    const toolbarActions = screen.getByTestId('connections-toolbar-actions');
    const summary = screen.getByTestId('connections-summary');
    expect(toolbarActions).toHaveClass('w-full', 'min-w-0', 'justify-between');
    expect(summary).toHaveClass('min-w-0', 'overflow-hidden');
    expect(screen.getByRole('button', { name: 'Add Connection' })).toHaveClass(
      'shrink-0',
      'max-sm:w-7.5'
    );
    expect(screen.getByText('Monitored 1/5')).toHaveClass('max-lg:hidden');
    expect(screen.getByText('Needs Attention 1')).toHaveClass('max-lg:hidden');
    expect(screen.getByText('Best Rank #2')).toHaveClass('max-lg:hidden');
    expect(screen.getByText('Monitoring Active')).toHaveClass('max-lg:hidden');
  });
});
