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

  it('routes ready audio to the shell player without a native transport', () => {
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

    expect(
      screen.getByRole('button', {
        name: 'Preview Take Me Over.wav in player',
      })
    ).toBeTruthy();
    expect(document.querySelector('audio')).toBeNull();
    expect(
      screen.getByText('Matched Take Me Over · attaching audio')
    ).toBeTruthy();
  });
});
