import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AudioPreviewStrip } from '@/components/jovie/components/AudioPreviewStrip';

describe('AudioPreviewStrip', () => {
  it('renders uploading state', () => {
    render(
      <AudioPreviewStrip
        audio={{
          id: 'audio-1',
          name: 'demo-track.mp3',
          mediaType: 'audio/mpeg',
          status: 'uploading',
        }}
      />
    );

    expect(screen.getByTestId('chat-audio-preview-strip')).toBeTruthy();
    expect(screen.getByText('demo-track.mp3')).toBeTruthy();
    expect(screen.getByText('Uploading audio…')).toBeTruthy();
  });

  it('renders ready state with player', () => {
    render(
      <AudioPreviewStrip
        audio={{
          id: 'audio-2',
          name: 'Take Me Over.wav',
          mediaType: 'audio/wav',
          status: 'ready',
          previewUrl: 'https://example.com/audio.wav',
          releaseTitle: 'Take Me Over',
          inference: {
            kind: 'attach-to-existing',
            confidence: 'high',
            suggestedTitle: 'Take Me Over',
            releaseId: 'release-1',
            releaseTitle: 'Take Me Over',
            matchScore: 1,
          },
        }}
      />
    );

    expect(screen.getByTestId('chat-audio-preview-player')).toBeTruthy();
    expect(
      screen.getByText('Matched Take Me Over · attaching audio')
    ).toBeTruthy();
  });

  it('renders a low-confidence draft classification', () => {
    render(
      <AudioPreviewStrip
        audio={{
          id: 'audio-low',
          name: 'take-me-over-mix.mp3',
          mediaType: 'audio/mpeg',
          status: 'ready',
          previewUrl: 'https://example.com/audio.mp3',
          releaseTitle: 'take me over mix',
          inference: {
            kind: 'new-track',
            confidence: 'low',
            suggestedTitle: 'take me over mix',
            releaseId: 'release-1',
            releaseTitle: 'Take Me Over',
            matchScore: 0.75,
          },
        }}
      />
    );

    expect(
      screen.getByText('Might match Take Me Over · saved as a draft')
    ).toBeTruthy();
  });

  it.each([
    ['processing', 'Processing audio…'],
    ['failed', 'The audio service is unavailable'],
    ['cancelled', 'Upload cancelled'],
  ] as const)('renders the %s lifecycle state', (status, label) => {
    render(
      <AudioPreviewStrip
        audio={{
          id: `audio-${status}`,
          name: 'demo-track.mp3',
          mediaType: 'audio/mpeg',
          status,
          error:
            status === 'failed'
              ? 'The audio service is unavailable'
              : undefined,
        }}
      />
    );

    expect(screen.getByTestId('chat-audio-preview-strip')).toHaveAttribute(
      'data-upload-state',
      status
    );
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByTestId('chat-audio-preview-player')).toBeNull();
  });
});
