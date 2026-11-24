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
    expect(screen.getByLabelText('Seek Track')).toBeDisabled();
  });

  it('shows a deliberate idle dash instead of malformed duration before playback', () => {
    render(
      <SmartLinkAudioPreview
        contentId='c1'
        title='Song'
        artistName='Artist'
        artworkUrl={null}
        previewUrl='https://cdn.example.com/preview.mp3'
      />
    );
    expect(screen.queryByText('–:––')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders no metadata line when there is no fallback source label', () => {
    const { container } = render(
      <SmartLinkAudioPreview
        contentId='c1'
        title='Song'
        artistName='Artist'
        artworkUrl={null}
        previewUrl='https://cdn.example.com/preview.mp3'
      />
    );
    expect(container.querySelector('p')).not.toBeInTheDocument();
  });

  it('renders the fallback source label when the preview is a fallback', () => {
    render(
      <SmartLinkAudioPreview
        contentId='c1'
        title='Song'
        artistName='Artist'
        artworkUrl={null}
        previewUrl='https://cdn.example.com/preview.mp3'
        previewVerification='fallback'
        previewSource='spotify'
      />
    );
    expect(screen.getByText('Spotify preview')).toBeInTheDocument();
  });

  it('shows a disabled loading state while the preview buffers', () => {
    Object.assign(playbackState, {
      activeTrackId: 'c1',
      playbackStatus: 'loading',
    });
    render(
      <SmartLinkAudioPreview
        contentId='c1'
        title='Song'
        artistName='Artist'
        artworkUrl={null}
        previewUrl='https://cdn.example.com/preview.mp3'
      />
    );
    const button = screen.getByRole('button', { name: 'Loading preview' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the real duration once metadata is available', () => {
    Object.assign(playbackState, {
      activeTrackId: 'c1',
      isPlaying: true,
      playbackStatus: 'playing',
      currentTime: 4,
      duration: 30,
    });
    render(
      <SmartLinkAudioPreview
        contentId='c1'
        title='Song'
        artistName='Artist'
        artworkUrl={null}
        previewUrl='https://cdn.example.com/preview.mp3'
      />
    );
    expect(screen.getByText('0:30 · Preview')).toBeInTheDocument();
    expect(screen.getByLabelText('Seek Track')).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Pause preview' })
    ).toBeInTheDocument();
  });

  it('shows an unavailable state when playback errors', () => {
    Object.assign(playbackState, {
      activeTrackId: 'c1',
      playbackStatus: 'error',
    });
    render(
      <SmartLinkAudioPreview
        contentId='c1'
        title='Song'
        artistName='Artist'
        artworkUrl={null}
        previewUrl='https://cdn.example.com/preview.mp3'
      />
    );
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play preview' })).toBeEnabled();
  });
});
