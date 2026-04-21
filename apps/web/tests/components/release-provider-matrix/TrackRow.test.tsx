import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackRow } from '@/features/dashboard/organisms/release-provider-matrix/components/TrackRow';
import type { ProviderKey, TrackViewModel } from '@/lib/discography/types';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
let playbackState = { activeTrackId: null as string | null, isPlaying: false };

beforeEach(() => {
  toggleTrack.mockClear();
  playbackState = { activeTrackId: null, isPlaying: false };
});

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState,
    toggleTrack,
  }),
}));

vi.mock('@/components/atoms/TruncatedText', () => ({
  TruncatedText: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock('@/components/molecules/CompactLinkRail', () => ({
  CompactLinkRail: () => <div data-testid='compact-link-rail' />,
}));

vi.mock('@/components/atoms/CopyableMonospaceCell', () => ({
  CopyableMonospaceCell: ({ value }: { value: string | null }) => (
    <span>{value ?? '—'}</span>
  ),
}));

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FC3C44' },
} as Record<ProviderKey, { label: string; accent: string }>;

function createTrack(overrides: Partial<TrackViewModel> = {}): TrackViewModel {
  return {
    id: 'track-1',
    releaseId: 'release-1',
    title: 'Open Skies',
    slug: 'open-skies',
    smartLinkPath: '/smart/track-1',
    trackNumber: 1,
    discNumber: 1,
    durationMs: 214000,
    isrc: 'USRC17607839',
    isExplicit: false,
    previewUrl: 'https://cdn.example.com/track.mp3',
    audioUrl: null,
    audioFormat: null,
    providers: [
      {
        key: 'spotify',
        url: 'https://open.spotify.com/track/1',
        source: 'ingested',
        updatedAt: '2026-01-01T00:00:00.000Z',
        label: 'Spotify',
        path: '/spotify',
        isPrimary: true,
      },
    ],
    ...overrides,
  };
}

function renderTrackRow(props: Partial<ComponentProps<typeof TrackRow>> = {}) {
  const track = props.track ?? createTrack();
  const renderMode = props.renderMode ?? 'table';
  const row = (
    <TrackRow
      track={track}
      providerConfig={providerConfig}
      allProviders={['spotify', 'apple_music']}
      columnCount={11}
      columnVisibility={{
        select: true,
        release: true,
        availability: true,
        metrics: true,
        primaryIsrc: true,
        actions: true,
      }}
      {...props}
    />
  );

  if (renderMode === 'stack') {
    return render(row);
  }

  return render(
    <table>
      <tbody>{row}</tbody>
    </table>
  );
}

describe('TrackRow', () => {
  it('marks selected rows with the selected state contract', () => {
    renderTrackRow({ isSelected: true });

    const row = screen.getByTestId('track-row-track-1');
    expect(row).toHaveAttribute('data-state', 'selected');
  });

  it('calls the row click handler and toggles preview playback', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    renderTrackRow({ onClick, renderMode: 'stack' });

    await user.click(
      screen.getByRole('button', { name: 'Open details for Open Skies' })
    );
    expect(onClick).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Play Open Skies' }));
    expect(toggleTrack).toHaveBeenCalledWith({
      id: 'track-1',
      title: 'Open Skies',
      audioUrl: 'https://cdn.example.com/track.mp3',
    });
  });

  it('keeps canonical track numbers in the release matrix row', () => {
    renderTrackRow({
      track: createTrack({ id: 'track-9', trackNumber: 9 }),
    });

    expect(screen.getByText('9.')).toBeInTheDocument();
  });
});
