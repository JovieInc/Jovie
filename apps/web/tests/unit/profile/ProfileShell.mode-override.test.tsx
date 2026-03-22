import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProfileShell } from '@/components/organisms/profile-shell';
import type { Artist, LegacySocialLink } from '@/types/db';

const { handleNotificationsClickMock, routerPushMock, useSearchParamsMock } =
  vi.hoisted(() => ({
    handleNotificationsClickMock: vi.fn(),
    routerPushMock: vi.fn(),
    useSearchParamsMock: vi.fn(() => new URLSearchParams()),
  }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => useSearchParamsMock(),
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

vi.mock('@/components/organisms/hooks/useProfileTracking', () => ({
  usePopstateReset: vi.fn(),
  useProfileVisitTracking: vi.fn(),
  useTipPageTracking: vi.fn(),
}));

vi.mock(
  '@/components/organisms/hooks/useProfileNotificationsController',
  () => ({
    useProfileNotificationsController: () => ({
      channel: 'sms',
      handleNotificationsClick: handleNotificationsClickMock,
      hasStoredContacts: false,
      hydrationStatus: 'done',
      openSubscription: vi.fn(),
      registerInputFocus: vi.fn(),
      setChannel: vi.fn(),
      setState: vi.fn(),
      setSubscribedChannels: vi.fn(),
      setSubscriptionDetails: vi.fn(),
      state: 'idle',
      subscribedChannels: {},
      subscriptionDetails: {},
      hasActiveSubscriptions: false,
    }),
  })
);

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

describe('useProfileShell mode overrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams('mode=profile&source=from-search')
    );
  });

  it('uses modeOverride for non-profile notification routing', () => {
    useSearchParamsMock.mockReturnValue(new URLSearchParams('mode=profile'));

    const { result } = renderHook(() =>
      useProfileShell({
        artist: makeArtist(),
        socialLinks: [] as LegacySocialLink[],
        contacts: [],
        modeOverride: 'tour',
      })
    );

    act(() => {
      result.current.handleNotificationsTrigger();
    });

    expect(routerPushMock).toHaveBeenCalledWith('/testartist?mode=subscribe');
    expect(handleNotificationsClickMock).not.toHaveBeenCalled();
  });

  it('uses modeOverride=profile to keep primary profile behavior', () => {
    const { result } = renderHook(() =>
      useProfileShell({
        artist: makeArtist(),
        socialLinks: [] as LegacySocialLink[],
        contacts: [],
        modeOverride: 'profile',
      })
    );

    act(() => {
      result.current.handleNotificationsTrigger();
    });

    expect(handleNotificationsClickMock).toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it('preserves sourceOverride when redirecting to subscribe', () => {
    const { result } = renderHook(() =>
      useProfileShell({
        artist: makeArtist(),
        socialLinks: [] as LegacySocialLink[],
        contacts: [],
        modeOverride: 'tip',
        sourceOverride: 'instagram',
      })
    );

    act(() => {
      result.current.handleNotificationsTrigger();
    });

    expect(routerPushMock).toHaveBeenCalledWith(
      '/testartist?mode=subscribe&source=instagram'
    );
  });
});
