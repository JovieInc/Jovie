import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SmartLinkAudioPreview } from './SmartLinkAudioPreview';

const baseProps = {
  contentId: 'preview-track-1',
  title: 'Never Say A Word',
  artistName: 'Jovie Artist',
  artworkUrl: null,
  previewUrl: 'https://cdn.example.com/preview.mp3',
} as const;

describe('SmartLinkAudioPreview', () => {
  it('names the transport button and keeps timestamps on the secondary text token', () => {
    render(<SmartLinkAudioPreview {...baseProps} />);
    expect(
      screen.getByRole('button', { name: 'Play preview' })
    ).toBeInTheDocument();
    expect(screen.getByText('0:00')).toHaveClass('text-secondary-token');
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
});
