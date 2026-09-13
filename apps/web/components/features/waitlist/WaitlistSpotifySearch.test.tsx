import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WaitlistSpotifySearch } from './WaitlistSpotifySearch';

const mockSearch = vi.fn();
const mockClear = vi.fn();
const mockHookReturn = {
  results: [],
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
  it('keeps the manual URL switch at the canonical 28px visible / 44px hit geometry', () => {
    render(
      <WaitlistSpotifySearch
        spotifyUrl=''
        onUrlChange={vi.fn()}
        onArtistNameChange={vi.fn()}
        fieldErrors={{}}
        isSubmitting={false}
        isHydrating
        setInputRef={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'artist' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /Manually add URL Paste a Spotify artist link/,
      })
    );

    const switchToSearch = screen.getByRole('button', {
      name: 'Search For Artist Instead',
    });
    expect(switchToSearch).toHaveClass(
      'h-7',
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11'
    );
    expect(switchToSearch.className).not.toMatch(/(?:^|\s)h-auto(?:\s|$)/);
  });
});
