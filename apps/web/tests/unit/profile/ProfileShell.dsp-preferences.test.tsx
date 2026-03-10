import { TooltipProvider } from '@jovie/ui';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpoint: () => true,
  useBreakpointDown: () => false,
}));

vi.mock('@/components/organisms/profile-shell/useProfileShell', () => ({
  useProfileShell: () => ({
    handleNotificationsTrigger: vi.fn(),
    notificationsEnabled: true,
    notificationsContextValue: {
      state: 'success',
      hydrationStatus: 'done',
      notificationsEnabled: true,
      hasStoredContacts: true,
      subscribedChannels: { email: true },
      subscriptionDetails: { email: 'fan@example.com' },
      openSubscription: vi.fn(),
      closeSubscription: vi.fn(),
      setState: vi.fn(),
      setChannel: vi.fn(),
      channel: 'email',
      registerInputFocus: vi.fn(),
      menuTriggerRef: { current: null },
      isNotificationMenuOpen: true,
      setIsNotificationMenuOpen: vi.fn(),
    },
    socialNetworkLinks: [],
    hasSocialLinks: false,
    notificationsController: {
      channelBusy: {},
      contentPreferences: {},
      handleMenuOpenChange: vi.fn(),
      handleUnsubscribe: vi.fn(),
      hasActiveSubscriptions: true,
      hydrationStatus: 'done',
      isNotificationMenuOpen: true,
      menuTriggerRef: { current: null },
      openSubscription: vi.fn(),
      registerInputFocus: vi.fn(),
      setState: vi.fn(),
      state: 'success',
      subscribedChannels: { email: true },
      subscriptionDetails: { email: 'fan@example.com' },
    },
  }),
}));

import { ProfileShell } from '@/components/organisms/profile-shell';
import { renderWithQueryClient } from '../../utils/test-utils';

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'artist-1',
    owner_user_id: 'owner-1',
    handle: 'testartist',
    spotify_id: 'spotify-artist-id',
    youtube_url: 'https://youtube.com/@artist',
    name: 'Test Artist',
    published: true,
    is_verified: false,
    is_featured: false,
    marketing_opt_out: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('ProfileShell DSP preferences', () => {
  it('uses connected social DSPs for listening preference options when present', () => {
    const socialLinks = [
      {
        id: 'social-1',
        artist_id: 'artist-1',
        platform: 'samsung_music',
        url: 'https://music.samsung.com/artist/123',
        clicks: 0,
        created_at: new Date().toISOString(),
      },
    ] as LegacySocialLink[];

    renderWithQueryClient(
      <TooltipProvider>
        <ProfileShell
          artist={makeArtist()}
          socialLinks={socialLinks}
          contacts={[] as PublicContact[]}
          showNotificationButton
        />
      </TooltipProvider>
    );

    const options = screen
      .getAllByRole('option')
      .map(option => option.textContent);
    expect(options).toContain('Samsung Music');
    expect(options).not.toContain('Spotify');
    expect(options).not.toContain('YouTube');
  });
});
