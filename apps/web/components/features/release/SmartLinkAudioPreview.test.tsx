import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SmartLinkAudioPreview } from './SmartLinkAudioPreview';

const mocks = vi.hoisted(() => ({
  toggleTrack: vi.fn(() => Promise.resolve()),
  seek: vi.fn(),
  onError: vi.fn(() => () => {}),
  toastError: vi.fn(),
  state: {
    activeTrackId: null as string | null,
    isPlaying: false,
    playbackStatus: 'idle' as 'idle' | 'loading' | 'playing' | 'error',
    currentTime: 0,
    duration: 0,
  },
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: mocks.state,
    toggleTrack: mocks.toggleTrack,
    seek: mocks.seek,
    onError: mocks.onError,
  }),
}));

vi.mock('@/components/feedback', () => ({
  toast: { error: mocks.toastError },
}));

const baseProps = {
  contentId: 'preview-track-1',
  title: 'Never Say A Word',
  artistName: 'Jovie Artist',
  artworkUrl: null,
  previewUrl: 'https://cdn.example.com/preview.mp3',
} as const;

describe('SmartLinkAudioPreview', () => {
  beforeEach(() => {
    mocks.toggleTrack.mockClear();
    mocks.state.activeTrackId = null;
    mocks.state.isPlaying = false;
    mocks.state.playbackStatus = 'idle';
    mocks.state.currentTime = 0;
    mocks.state.duration = 0;
  });

  it('names the transport button and keeps timestamps on the secondary text token', async () => {
    const { container } = render(<SmartLinkAudioPreview {...baseProps} />);
    expect(
      screen.getByRole('button', { name: 'Play preview' })
    ).toBeInTheDocument();
    expect(screen.getByText('0:00')).toHaveClass('text-secondary-token');
    await expectNoA11yViolations(container);
  });

  it('labels fallback sources with the secondary text token for contrast', () => {
    render(
      <SmartLinkAudioPreview
        {...baseProps}
        previewVerification='fallback'
        previewSource='spotify'
      />
    );
    expect(screen.getByText('Spotify preview')).toHaveClass(
      'text-secondary-token'
    );
  });

  it('starts the track when the play button is pressed, on media tokens', async () => {
    const user = userEvent.setup();
    render(<SmartLinkAudioPreview {...baseProps} />);
    const button = screen.getByRole('button', { name: 'Play preview' });
    expect(button).toHaveClass('bg-on-media/90', 'text-ink-on-media');
    expect(button.className).not.toMatch(/(^|\s)(bg-white|text-black)/);
    await user.click(button);
    expect(mocks.toggleTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'preview-track-1',
        title: 'Never Say A Word',
      })
    );
  });

  it('renders nothing when there is no preview', () => {
    const { container } = render(
      <SmartLinkAudioPreview {...baseProps} previewUrl={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the loading state and ignores presses while loading', async () => {
    const user = userEvent.setup();
    mocks.state.activeTrackId = 'preview-track-1';
    mocks.state.playbackStatus = 'loading';
    const { container } = render(<SmartLinkAudioPreview {...baseProps} />);
    const button = screen.getByRole('button', { name: 'Loading preview' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(mocks.toggleTrack).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows the playing state with elapsed and total time', async () => {
    mocks.state.activeTrackId = 'preview-track-1';
    mocks.state.isPlaying = true;
    mocks.state.playbackStatus = 'playing';
    mocks.state.currentTime = 12;
    mocks.state.duration = 30;
    const { container } = render(<SmartLinkAudioPreview {...baseProps} />);
    expect(
      screen.getByRole('button', { name: 'Pause preview' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('0:30 · Preview')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows Unavailable after a playback error', async () => {
    mocks.state.activeTrackId = 'preview-track-1';
    mocks.state.playbackStatus = 'error';
    const { container } = render(<SmartLinkAudioPreview {...baseProps} />);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('SmartLinkAudioPreview play glyph', () => {
  it('draws the play triangle through PlayGlyph (JOV-12568)', () => {
    const source = readFileSync(
      resolve(__dirname, './SmartLinkAudioPreview.tsx'),
      'utf8'
    );

    expect(source).toContain('<PlayGlyph');
    expect(source).toContain("from '@/components/atoms/PlayGlyph'");
    expect(source).not.toContain('translate-x-px');
  });
});
