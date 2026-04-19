import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileShell } from '@/components/organisms/profile-shell';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import { renderWithQueryClient } from '../../utils/test-utils';

const { pushMock, useSearchParamsMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  useSearchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => useSearchParamsMock(),
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: vi.fn(),
    error: vi.fn(),
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

describe('ProfileShell accessibility contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('renders one labeled profile mode navigation region with stable trigger names', () => {
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
          ] as unknown as LegacySocialLink[]
        }
        contacts={
          [
            { type: 'email', label: 'Booking', value: 'booking@example.com' },
          ] as PublicContact[]
        }
        showTourButton
        showPayButton
        showShopButton
      />
    );

    const nav = screen.getByRole('navigation', { name: 'Profile Modes' });
    expect(nav).toBeInTheDocument();

    expect(
      screen.getAllByRole('navigation', { name: 'Profile Modes' })
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contact' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tour Dates' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument();
  });
});
