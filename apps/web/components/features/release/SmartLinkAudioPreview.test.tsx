import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartLinkAudioPreview } from './SmartLinkAudioPreview';

const toggleTrack = vi.fn(() => Promise.resolve());
const playbackState = {
  activeTrackId: null as string | null,
  playbackStatus: 'idle',
  isPlaying: false,
  currentTime: 0,
  duration: 0,
};

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState,
    toggleTrack,
    seek: vi.fn(),
    onError: () => () => {},
  }),
}));
vi.mock('@/components/feedback', () => ({ toast: { error: vi.fn() } }));

const baseProps = {
  contentId: 'preview-track-1',
  title: 'Never Say A Word',
  artistName: 'Jovie Artist',
  artworkUrl: null,
  previewUrl: 'https://cdn.example.com/preview.mp3',
};

describe('SmartLinkAudioPreview', () => {
  beforeEach(() => {
    toggleTrack.mockClear();
  });

  it('renders nothing without a preview url', () => {
    const { container } = render(
      <SmartLinkAudioPreview {...baseProps} previewUrl={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles playback from a named button', () => {
    render(<SmartLinkAudioPreview {...baseProps} />);
    const button = screen.getByRole('button', { name: 'Play preview' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(toggleTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'preview-track-1' })
    );
  });

  it('renders the fallback source label at the raised white/50 contrast', () => {
    render(
      <SmartLinkAudioPreview
        {...baseProps}
        previewVerification='fallback'
        previewSource='spotify'
      />
    );
    expect(screen.getByText('Spotify preview')).toHaveClass('text-white/50');
  });
});
