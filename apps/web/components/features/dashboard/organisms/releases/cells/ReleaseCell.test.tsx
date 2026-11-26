import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseCell } from './ReleaseCell';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
let playbackState = { activeTrackId: null as string | null, isPlaying: false };

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState,
    toggleTrack,
    seek: vi.fn(),
  }),
}));

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  releaseType: 'single',
  status: 'released',
  isExplicit: false,
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: 'https://cdn.example.com/preview.mp3',
  primaryIsrc: null,
  upc: null,
};

describe('ReleaseCell', () => {
  beforeEach(() => {
    toggleTrack.mockClear();
    playbackState = { activeTrackId: null, isPlaying: false };
  });

  it('plays the preview from the play control without selecting the row', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <ReleaseCell
        release={release}
        artistName='Jovie Artist'
        onSelect={onSelect}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Play Skyline Dreams' })
    );
    expect(toggleTrack).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('selects the release from the title button', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ReleaseCell
        release={{ ...release, previewUrl: null }}
        artistName='Jovie Artist'
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByRole('button', { name: /Skyline Dreams/ }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'release-1' })
    );
  });

  it('shows the pause control while the track is playing and stays axe-clean', async () => {
    playbackState = { activeTrackId: 'release-1', isPlaying: true };
    const { container } = render(
      <ReleaseCell release={release} artistName='Jovie Artist' />
    );

    expect(
      screen.getByRole('button', { name: 'Pause Skyline Dreams' })
    ).toHaveAttribute('aria-pressed', 'true');
    await expectNoA11yViolations(container);
  });

  it('renders a read-only title with no preview and stays axe-clean', async () => {
    const { container } = render(
      <ReleaseCell
        release={{ ...release, previewUrl: null }}
        showType={false}
      />
    );

    expect(screen.getByText('Skyline Dreams')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
