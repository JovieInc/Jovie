import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalAudioPreviewAction } from '@/components/organisms/GlobalAudioPreviewAction';

const { mockPlayer, mockStop, mockToggleTrack } = vi.hoisted(() => ({
  mockStop: vi.fn(),
  mockToggleTrack: vi.fn(() => Promise.resolve()),
  mockPlayer: {
    playbackState: {
      activeTrackId: null as string | null,
      sourceKind: null as string | null,
      playbackStatus: 'idle',
      isPlaying: false,
    },
  },
}));

vi.mock('@/components/organisms/release-sidebar/useTrackAudioPlayer', () => ({
  useTrackAudioPlayer: () => ({
    playbackState: mockPlayer.playbackState,
    toggleTrack: mockToggleTrack,
    stop: mockStop,
  }),
}));

const releaseProps = {
  id: 'release-1',
  title: 'Midnight Drive',
  audioUrl: 'https://cdn.example.com/midnight.mp3',
  sourceKind: 'release-preview' as const,
  releaseTitle: 'Midnight Drive',
  artistName: 'Ari',
  artworkUrl: 'https://cdn.example.com/art.jpg',
};

describe('GlobalAudioPreviewAction', () => {
  beforeEach(() => {
    mockPlayer.playbackState = {
      activeTrackId: null,
      sourceKind: null,
      playbackStatus: 'idle',
      isPlaying: false,
    };
    mockStop.mockClear();
    mockToggleTrack.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('selects typed preview provenance without rendering a local transport', () => {
    render(<GlobalAudioPreviewAction {...releaseProps} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Preview Midnight Drive in player',
      })
    );

    expect(mockToggleTrack).toHaveBeenCalledWith(releaseProps);
    expect(document.querySelector('audio')).toBeNull();
  });

  it.each([
    ['loading', false, 'Loading in Player', true],
    ['buffering', false, 'Buffering in Player', true],
    ['stalled', false, 'Buffering in Player', true],
    ['seeking', false, 'Seeking in Player', true],
    ['paused', false, 'Paused in Player', false],
    ['playing', true, 'Playing in Player', false],
  ])('renders %s as status-only', (playbackStatus, isPlaying, label, pending) => {
    mockPlayer.playbackState = {
      activeTrackId: releaseProps.id,
      sourceKind: releaseProps.sourceKind,
      playbackStatus,
      isPlaying,
    };

    const { container } = render(
      <GlobalAudioPreviewAction {...releaseProps} />
    );

    expect(screen.getByRole('status')).toHaveTextContent(label);
    expect(screen.queryByRole('button')).toBeNull();
    expect(Boolean(container.querySelector('svg'))).toBe(pending);
  });

  it('does not confuse equal ids from different source kinds', () => {
    mockPlayer.playbackState = {
      activeTrackId: releaseProps.id,
      sourceKind: 'chat-upload-preview',
      playbackStatus: 'playing',
      isPlaying: true,
    };

    render(<GlobalAudioPreviewAction {...releaseProps} />);

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('does not confuse different ids from the same source kind', () => {
    mockPlayer.playbackState = {
      activeTrackId: 'release-2',
      sourceKind: releaseProps.sourceKind,
      playbackStatus: 'playing',
      isPlaying: true,
    };

    render(<GlobalAudioPreviewAction {...releaseProps} />);

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('stops ephemeral upload playback on unmount', () => {
    mockPlayer.playbackState = {
      activeTrackId: 'upload-1',
      sourceKind: 'chat-upload-preview',
      playbackStatus: 'playing',
      isPlaying: true,
    };
    const { unmount } = render(
      <GlobalAudioPreviewAction
        id='upload-1'
        title='Rough Mix.wav'
        audioUrl='blob:https://jov.ie/upload-1'
        sourceKind='chat-upload-preview'
        stopOnUnmount
      />
    );

    unmount();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('uses the latest authority state when an upload becomes active', () => {
    const { rerender, unmount } = render(
      <GlobalAudioPreviewAction
        id='upload-1'
        title='Rough Mix.wav'
        audioUrl='blob:https://jov.ie/upload-1'
        sourceKind='chat-upload-preview'
        stopOnUnmount
      />
    );

    mockPlayer.playbackState = {
      activeTrackId: 'upload-1',
      sourceKind: 'chat-upload-preview',
      playbackStatus: 'playing',
      isPlaying: true,
    };
    rerender(
      <GlobalAudioPreviewAction
        id='upload-1'
        title='Rough Mix.wav'
        audioUrl='blob:https://jov.ie/upload-1'
        sourceKind='chat-upload-preview'
        stopOnUnmount
      />
    );
    unmount();

    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('stops an active upload before the surface adopts another source', () => {
    mockPlayer.playbackState = {
      activeTrackId: 'upload-1',
      sourceKind: 'chat-upload-preview',
      playbackStatus: 'playing',
      isPlaying: true,
    };
    const { rerender } = render(
      <GlobalAudioPreviewAction
        id='upload-1'
        title='Rough Mix.wav'
        audioUrl='blob:https://jov.ie/upload-1'
        sourceKind='chat-upload-preview'
        stopOnUnmount
      />
    );

    rerender(
      <GlobalAudioPreviewAction
        id='upload-2'
        title='New Mix.wav'
        audioUrl='blob:https://jov.ie/upload-2'
        sourceKind='chat-upload-preview'
        stopOnUnmount
      />
    );

    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it('keeps durable release playback alive when its panel unmounts', () => {
    mockPlayer.playbackState = {
      activeTrackId: releaseProps.id,
      sourceKind: releaseProps.sourceKind,
      playbackStatus: 'playing',
      isPlaying: true,
    };
    const { unmount } = render(<GlobalAudioPreviewAction {...releaseProps} />);

    unmount();

    expect(mockStop).not.toHaveBeenCalled();
  });

  it('does not stop an inactive ephemeral preview on unmount', () => {
    const { unmount } = render(
      <GlobalAudioPreviewAction
        id='upload-1'
        title='Rough Mix.wav'
        audioUrl='blob:https://jov.ie/upload-1'
        sourceKind='chat-upload-preview'
        stopOnUnmount
      />
    );

    unmount();

    expect(mockStop).not.toHaveBeenCalled();
  });
});
