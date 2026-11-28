import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderKey, TrackViewModel } from '@/lib/discography/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TrackRow, TrackRowsContainer } from './TrackRow';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
let playbackState = { activeTrackId: null as string | null, isPlaying: false };

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({ playbackState, toggleTrack }),
}));

vi.mock('@/components/atoms/TruncatedText', () => ({
  TruncatedText: ({ children }: { readonly children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
} as Record<ProviderKey, { label: string; accent: string }>;

const track: TrackViewModel = {
  id: 'track-1',
  releaseId: 'release-1',
  releaseSlug: 'summer-lights',
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
  providers: [],
};

function renderRow(props: Partial<React.ComponentProps<typeof TrackRow>> = {}) {
  return render(
    <table>
      <tbody>
        <TrackRow
          track={track}
          providerConfig={providerConfig}
          allProviders={['spotify']}
          columnCount={11}
          {...props}
        />
      </tbody>
    </table>
  );
}

describe('TrackRow', () => {
  beforeEach(() => {
    toggleTrack.mockClear();
    playbackState = { activeTrackId: null, isPlaying: false };
  });

  it('plays the preview without opening the row', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = renderRow({ onClick });

    const play = screen.getByRole('button', { name: 'Play Open Skies' });
    await user.click(play);
    expect(toggleTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-1', audioUrl: track.previewUrl })
    );
    expect(onClick).not.toHaveBeenCalled();
    expect(
      container.querySelectorAll('[data-app-table-cell="content"]').length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('shows a pause control for the playing track', () => {
    playbackState = { activeTrackId: 'track-1', isPlaying: true };
    renderRow();
    expect(
      screen.getByRole('button', { name: 'Pause Open Skies' })
    ).toBeInTheDocument();
  });

  it('shows no play control without a preview', async () => {
    const { container } = renderRow({
      track: { ...track, previewUrl: null, audioUrl: null },
    });
    expect(
      screen.queryByRole('button', { name: /Play Open Skies/ })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('No Preview Available')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens track details from the stack layout', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <TrackRow
        track={track}
        providerConfig={providerConfig}
        allProviders={['spotify']}
        columnCount={11}
        renderMode='stack'
        onClick={onClick}
      />
    );

    await user.click(
      screen.getByRole('button', { name: /Open details for 1\. Open Skies/ })
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('explains an empty release in both layouts', async () => {
    const stack = render(
      <TrackRowsContainer
        tracks={[]}
        providerConfig={providerConfig}
        allProviders={['spotify']}
        columnCount={11}
        renderMode='stack'
      />
    );
    expect(screen.getByText('No tracks found for this release')).toBeVisible();
    await expectNoA11yViolations(stack.container);
  });
});
