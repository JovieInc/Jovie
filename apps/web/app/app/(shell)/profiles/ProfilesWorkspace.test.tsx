import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
      primaryIssue: 'Connected',
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

describe('ProfilesWorkspace', () => {
  it('filters the unified table without exposing locked rank values', () => {
    render(<ProfilesWorkspace data={data} />);

    expect(screen.getByText('Jovie Profile')).toBeInTheDocument();
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.queryByText('7')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 5 monitored')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dsps' }));
    expect(screen.getByText('Spotify')).toBeInTheDocument();
    expect(screen.queryByText('Jovie Profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connectors' }));
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });
});
