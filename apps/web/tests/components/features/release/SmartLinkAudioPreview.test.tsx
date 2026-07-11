import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartLinkAudioPreview } from '@/components/features/release/SmartLinkAudioPreview';

const toggleTrack = vi.fn().mockResolvedValue(undefined);
const seek = vi.fn();
const onError = vi.fn(() => () => {});
const playbackState = {
  activeTrackId: null as string | null,
  isPlaying: false,
  playbackStatus: 'idle' as const,
  lastErrorReason: null,
  currentTime: 0,
  duration: 0,
  trackTitle: null,
  releaseTitle: null,
  artistName: null,
  artworkUrl: null,
  hasLyrics: false,
  queueLength: 0,
  queueIndex: -1,
  hasNext: false,
  hasPrevious: false,
};

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({ playbackState, toggleTrack, seek, onError }),
}));

describe('SmartLinkAudioPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(playbackState, {
      activeTrackId: null,
      isPlaying: false,
      playbackStatus: 'idle',
      currentTime: 0,
      duration: 0,
    });
  });

  it('renders nothing without a preview URL', () => {
    const { container } = render(
      <SmartLinkAudioPreview
        contentId='c1'
        title='Song'
        artistName='Artist'
        artworkUrl={null}
        previewUrl={null}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('dispatches toggle to the global engine on play', () => {
    render(
      <SmartLinkAudioPreview
        contentId='c1'
        title='Song'
        artistName='Artist'
        artworkUrl='https://cdn.example.com/art.jpg'
        previewUrl='https://cdn.example.com/preview.mp3'
        isrc='USRC17607839'
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));
    expect(toggleTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'c1',
        audioUrl: 'https://cdn.example.com/preview.mp3',
      })
    );
  });

  it('disables seek until duration is known', () => {
    render(
      <SmartLinkAudioPreview
        contentId='c1'
        title='Song'
        artistName='Artist'
        artworkUrl={null}
        previewUrl='https://cdn.example.com/preview.mp3'
      />
    );
    expect(screen.getByTestId('smart-link-audio-preview')).toBeInTheDocument();
    expect(screen.getByLabelText('Seek track')).toBeDisabled();
  });
});
