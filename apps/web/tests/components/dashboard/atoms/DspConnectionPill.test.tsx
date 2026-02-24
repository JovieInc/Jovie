import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DspConnectionPill } from '@/components/dashboard/atoms/DspConnectionPill';

vi.mock('@/components/dashboard/atoms/DspProviderIcon', () => ({
  DspProviderIcon: ({ provider }: { provider: string }) => (
    <span data-testid={`provider-icon-${provider}`} />
  ),
  PROVIDER_COLORS: {
    spotify: '#1DB954',
    apple_music: '#FA243C',
    youtube_music: '#FF0000',
    soundcloud: '#FF5500',
    tidal: '#000000',
  },
  PROVIDER_LABELS: {
    spotify: 'Spotify',
    apple_music: 'Apple Music',
    youtube_music: 'YouTube Music',
    soundcloud: 'SoundCloud',
    tidal: 'Tidal',
  },
}));

describe('DspConnectionPill', () => {
  it('renders shared provider icon for connected pills', () => {
    render(
      <DspConnectionPill
        provider='spotify'
        connected
        artistName='Jovie Artist'
      />
    );

    expect(screen.getByTestId('provider-icon-spotify')).toBeInTheDocument();
    expect(screen.getByText('Jovie Artist')).toBeInTheDocument();
  });

  it('uses provider label in disconnected aria-label', () => {
    render(
      <DspConnectionPill
        provider='apple_music'
        connected={false}
        onClick={() => {}}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Connect Apple Music' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('provider-icon-apple_music')).toBeInTheDocument();
  });
});
