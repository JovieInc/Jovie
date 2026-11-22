import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProfilePrimaryCTA } from './ProfilePrimaryCTA';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';
import { LISTEN_VIEW_DSPS } from './views/listen-view-state-fixtures';

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

const breakpoint = vi.hoisted(() => ({ isMobile: false }));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => breakpoint.isMobile,
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
  ListenDrawer: ({ open }: { readonly open: boolean }) =>
    open ? <div data-testid='listen-drawer' /> : null,
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
      name: 'Listen now — Open Listen page with music links',
    });
    expect(listenCta).toHaveAttribute('href', '/timwhite/listen');
    expect(listenCta).toHaveClass(
      'before:h-full',
      'before:min-h-11',
      'before:min-w-11'
    );
    expect(listenCta).not.toHaveClass('before:h-11');
  });

  it('opens the listen drawer from the mobile PlainButton, which is type=button', async () => {
    breakpoint.isMobile = true;
    try {
      const user = userEvent.setup();
      render(
        <ProfilePrimaryCTA
          artist={PROFILE_STORY_ARTIST}
          socialLinks={[]}
          spotifyPreferred={false}
          showCapture={false}
          mergedDSPs={LISTEN_VIEW_DSPS}
        />
      );

      const trigger = screen.getByRole('button', {
        name: 'Open music streaming links',
      });
      expect(trigger).toHaveAttribute('type', 'button');
      expect(screen.queryByTestId('listen-drawer')).not.toBeInTheDocument();

      await user.click(trigger);

      expect(screen.getByTestId('listen-drawer')).toBeInTheDocument();
    } finally {
      breakpoint.isMobile = false;
    }
  });
});
