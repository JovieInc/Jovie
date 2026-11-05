import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartLinkAudioPreview } from './SmartLinkAudioPreview';

const mockUseTrackAudioPlayer = vi.hoisted(() => vi.fn());

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: (...args: unknown[]) => mockUseTrackAudioPlayer(...args),
}));

function makePlayer(overrides: Record<string, unknown> = {}) {
  return {
    playbackState: {
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: 'idle',
      currentTime: 0,
      duration: 0,
    },
    toggleTrack: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(),
    onError: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

describe('SmartLinkAudioPreview', () => {
  beforeEach(() => {
    mockUseTrackAudioPlayer.mockReset();
    mockUseTrackAudioPlayer.mockReturnValue(makePlayer());
  });

  it('renders nothing when no preview URL exists (JOV-INV-046)', () => {
    const { container } = render(
      <SmartLinkAudioPreview
        contentId='content-1'
        title='Midnight Echo'
        artistName='Test Artist'
        artworkUrl={null}
        previewUrl={null}
      />
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('smart-link-audio-preview')).toBeNull();
  });

  it('renders the preview control when a preview URL exists', () => {
    render(
      <SmartLinkAudioPreview
        contentId='content-1'
        title='Midnight Echo'
        artistName='Test Artist'
        artworkUrl={null}
        previewUrl='https://cdn.example.com/preview.mp3'
      />
    );

    expect(screen.getByTestId('smart-link-audio-preview')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play preview' })
    ).toBeInTheDocument();
  });

  it('keeps the control mounted after a playback error instead of dead-ending', () => {
    mockUseTrackAudioPlayer.mockReturnValue(
      makePlayer({
        playbackState: {
          activeTrackId: 'content-1',
          isPlaying: false,
          playbackStatus: 'error',
          currentTime: 0,
          duration: 0,
        },
      })
    );

    render(
      <SmartLinkAudioPreview
        contentId='content-1'
        title='Midnight Echo'
        artistName='Test Artist'
        artworkUrl={null}
        previewUrl='https://cdn.example.com/preview.mp3'
      />
    );

    // The control stays mounted so playback stays retryable, and the surface
    // never renders dead-end copy (JOV-INV-046).
    expect(
      screen.getByRole('button', { name: 'Play preview' })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/unavailable|not available|not supported/i)
    ).toBeNull();
  });
});
