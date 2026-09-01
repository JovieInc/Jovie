import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProfilePrimaryCTA } from './ProfilePrimaryCTA';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    readonly href: string;
    readonly children: ReactNode;
    readonly prefetch?: boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

vi.mock(
  '@/components/organisms/profile-shell/ProfileNotificationsContext',
  () => ({
    useProfileNotifications: () => ({
      hasStoredContacts: false,
      hydrationStatus: 'idle',
      notificationsEnabled: false,
      state: 'idle',
      subscribedChannels: { email: false, sms: false },
    }),
  })
);

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: () => null,
  })
);

vi.mock(
  '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA',
  () => ({
    TwoStepNotificationsCTA: () => null,
  })
);

vi.mock('./ListenDrawer', () => ({
  ListenDrawer: () => null,
}));

describe('ProfilePrimaryCTA', () => {
  it('renders the desktop listen link with the canonical tap target', () => {
    render(
      <ProfilePrimaryCTA
        artist={PROFILE_STORY_ARTIST}
        socialLinks={[]}
        spotifyPreferred={false}
        showCapture={false}
      />
    );

    const listenCta = screen.getByRole('link', {
      name: 'Open Listen page with music links',
    });
    expect(listenCta).toHaveAttribute('href', '/timwhite/listen');
    expect(listenCta.className).toContain('before:h-11');
    expect(listenCta.className).toContain('before:min-w-11');
  });
});
