import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpotifyArtistResult } from '@/lib/queries';
import { WaitlistSpotifySearch } from './WaitlistSpotifySearch';

const mockSearch = vi.fn();
const mockClear = vi.fn();
const mockHookReturn = {
  results: [] as SpotifyArtistResult[],
  state: 'idle' as const,
  search: mockSearch,
  clear: mockClear,
};

vi.mock('@/lib/queries', () => ({
  useArtistSearchQuery: () => mockHookReturn,
}));

vi.mock('@/components/atoms/SocialIcon', () => ({
  SocialIcon: ({
    platform,
    className,
  }: {
    platform: string;
    className?: string;
  }) => <span data-testid={`social-icon-${platform}`} className={className} />,
}));

describe('WaitlistSpotifySearch', () => {
  beforeEach(() => {
    mockHookReturn.results = [];
    vi.clearAllMocks();
  });

  it.each([
    'manual',
    'selected',
  ] as const)('lets the %s mode switch grow while preserving its canonical minimum target', mode => {
    const onUrlChange = vi.fn();
    const onArtistNameChange = vi.fn();
    if (mode === 'selected') {
      mockHookReturn.results = [
        {
          id: 'example-artist',
          name: 'Example Artist',
          url: 'https://open.spotify.com/artist/example',
          popularity: 0,
        },
      ];
    }
    render(
      <WaitlistSpotifySearch
        spotifyUrl=''
        onUrlChange={onUrlChange}
        onArtistNameChange={onArtistNameChange}
        fieldErrors={{}}
        isSubmitting={false}
        isHydrating
        setInputRef={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'artist' },
    });
    if (mode === 'selected') {
      fireEvent.change(screen.getByLabelText('Spotify Artist Results'), {
        target: { value: 'example-artist' },
      });
    } else {
      fireEvent.click(
        screen.getByRole('button', {
          name: /Manually add URL Paste a Spotify artist link/,
        })
      );
    }

    const switchToSearch = screen.getByRole('button', {
      name: mode === 'selected' ? 'Change' : 'Search For Artist Instead',
    });
    expect(switchToSearch).toHaveClass(
      'h-auto',
      'min-h-7',
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11'
    );
    expect(switchToSearch.className).not.toMatch(/(?:^|\s)h-7(?:\s|$)/);
    fireEvent.click(switchToSearch);
    expect(screen.getByRole('combobox')).toBeVisible();
    expect(onUrlChange).toHaveBeenLastCalledWith('');
    expect(onArtistNameChange).toHaveBeenLastCalledWith(null);
  });
});
