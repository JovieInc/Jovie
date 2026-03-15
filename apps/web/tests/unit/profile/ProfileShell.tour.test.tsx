import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileShell } from '@/components/organisms/profile-shell';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import { renderWithQueryClient } from '../../utils/test-utils';

const { push } = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push,
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
  beforeEach(() => {
    push.mockReset();
  });

  it('navigates to tour mode when the tour button is clicked', () => {
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

    fireEvent.click(tourTrigger);

    expect(push).toHaveBeenCalledWith('/testartist?mode=tour');
  });

  it('navigates to tip mode when the tip button is clicked on desktop', () => {
    renderWithQueryClient(
      <ProfileShell
        artist={makeArtist()}
        socialLinks={
          [
            {
              id: 'venmo-1',
              artist_id: 'artist-1',
              platform: 'venmo',
              url: 'https://venmo.com/testartist',
              clicks: 0,
              is_visible: true,
              sort_order: 0,
            },
          ] as LegacySocialLink[]
        }
        contacts={[] as PublicContact[]}
        showTipButton
      />
    );

    fireEvent.click(screen.getByTestId('tip-trigger'));

    expect(push).toHaveBeenCalledWith('/testartist?mode=tip');
  });
});
