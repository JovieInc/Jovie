import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileShell } from '@/components/organisms/profile-shell';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import { renderWithQueryClient } from '../../utils/test-utils';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'artist-1',
    owner_user_id: 'owner-1',
    handle: 'testartist',
    spotify_id: 'spotify-1',
    name: 'Test Artist',
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ProfileShell tour navigation', () => {
  it('renders a calendar navigation button for tour mode', () => {
    renderWithQueryClient(
      <ProfileShell
        artist={makeArtist()}
        socialLinks={[] as LegacySocialLink[]}
        contacts={[] as PublicContact[]}
        showTourButton
      />
    );

    const tourTrigger = screen.getByTestId('tour-trigger');
    expect(tourTrigger).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /tour dates/i })).toHaveAttribute(
      'href',
      '/testartist?mode=tour'
    );
  });
});
