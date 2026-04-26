import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileShell } from '@/components/organisms/profile-shell';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';
import { renderWithQueryClient } from '../../utils/test-utils';

const { routerPushMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useRouter: () => ({
    push: routerPushMock,
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

describe('ProfileShell notification trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerPushMock.mockReset();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/testartist?mode=pay');
  });

  it('routes bell clicks from pay mode to subscribe mode when there are no active subscriptions', () => {
    renderWithQueryClient(
      <ProfileShell
        artist={makeArtist()}
        socialLinks={[] as LegacySocialLink[]}
        contacts={[] as PublicContact[]}
        showNotificationButton
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /turn on alerts/i }));

    expect(routerPushMock).toHaveBeenCalledWith('/testartist?mode=subscribe');
  });

  it('propagates the source search param when clicking the notification bell', () => {
    window.history.replaceState(
      null,
      '',
      '/testartist?mode=pay&source=someSource'
    );

    renderWithQueryClient(
      <ProfileShell
        artist={makeArtist()}
        socialLinks={[] as LegacySocialLink[]}
        contacts={[] as PublicContact[]}
        showNotificationButton
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /turn on alerts/i }));

    expect(routerPushMock).toHaveBeenCalledWith(
      '/testartist?mode=subscribe&source=someSource'
    );
  });
});
