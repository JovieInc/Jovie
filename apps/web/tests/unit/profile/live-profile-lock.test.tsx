import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';
import { StaticArtistPage } from '@/features/profile/StaticArtistPage';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

vi.mock('@/lib/cookies/consent', () => ({
  saveConsent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/dynamic', () => {
  return {
    default: (
      loader: () => Promise<
        | React.ComponentType<Record<string, unknown>>
        | { default: React.ComponentType<Record<string, unknown>> }
      >
    ) => {
      const Lazy = React.lazy(async () => {
        const loaded = await loader();
        if (typeof loaded === 'function') {
          return { default: loaded };
        }
        return loaded;
      });
      return function DynamicProfileChunk(props: Record<string, unknown>) {
        return React.createElement(
          React.Suspense,
          { fallback: null },
          React.createElement(Lazy, props)
        );
      };
    },
  };
});

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
    readonly prefetch?: boolean;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => false,
}));

vi.mock('@/lib/queries/useNotificationStatusQuery', () => {
  const mutation = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
  return {
    useNotificationStatusQuery: () => ({ data: null, isLoading: false }),
    useSubscribeNotificationsMutation: mutation,
    useUnsubscribeNotificationsMutation: mutation,
    useUpdateContentPreferencesMutation: mutation,
    useUpdateSubscriberNameMutation: mutation,
    useUpdateSubscriberBirthdayMutation: mutation,
    useVerifyEmailOtpMutation: mutation,
  };
});

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: () => ({ user: null, isLoaded: true, isSignedIn: false }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn() }),
}));

vi.mock('@/lib/dsp', () => ({
  sortDSPsByGeoPopularity: (dsps: unknown[]) => dsps,
  sortDSPsForDevice: (dsps: unknown[]) => dsps,
}));

vi.mock('@/lib/profile-dsps', () => ({
  getCanonicalProfileDSPs: () => [],
}));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    available: [],
    primaryChannel: (contact: PublicContact) => contact.channels[0],
    isEnabled: true,
    getActionHref: () => 'mailto:book@example.com',
    trackAction: () => {},
  }),
}));

vi.mock('@/components/organisms/profile-shell/useProfileShell', () => ({
  useProfileShell: () => ({
    notificationsContextValue: {
      subscribedChannels: {},
      subscriptionDetails: {},
      setSubscribedChannels: vi.fn(),
      setSubscriptionDetails: vi.fn(),
      setState: vi.fn(),
    },
    notificationsController: { contentPreferences: null },
  }),
}));

const artist = {
  id: 'artist-1',
  name: 'Tim White',
  handle: 'timwhite',
  image_url: null,
  tagline: null,
  location: null,
  hometown: null,
  career_highlights: null,
  is_public: true,
  is_verified: false,
  active_since_year: null,
  published: true,
  is_verified_flag: false,
} satisfies Artist;

const contacts = [
  {
    id: 'contact-1',
    role: 'booking',
    roleLabel: 'Booking',
    territorySummary: 'Worldwide',
    territoryCount: 1,
    secondaryLabel: 'book@example.com',
    channels: [{ type: 'email' as const, encoded: 'book@example.com' }],
  },
] satisfies PublicContact[];

const socialLinks = [
  {
    platform: 'venmo',
    url: 'https://venmo.com/u/timwhite',
  },
] as LegacySocialLink[];

function installMatchMedia(desktop: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches:
      desktop &&
      (query === '(min-width: 768px)' || query === '(min-width: 1180px)'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
}

describe('live public profile lock', () => {
  beforeEach(() => {
    installMatchMedia(false);
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      writable: true,
      value: 'jv_cc_required=1',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the public profile route entry and every locked journey', async () => {
    render(
      <>
        <StaticArtistPage
          mode='profile'
          artist={artist}
          socialLinks={socialLinks}
          contacts={contacts}
          subtitle='Music, releases & updates'
          showBackButton={false}
          showPayButton
          allowFanCapture
          releaseCredits={[
            {
              role: 'producer',
              label: 'Producer',
              entries: [
                {
                  artistId: 'ada',
                  name: 'Ada Lovelace',
                  handle: null,
                  role: 'producer',
                  position: 0,
                },
              ],
            },
          ]}
        />
        <CookieBannerSection testOnlyPathname='/timwhite' />
      </>
    );

    expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
      'data-layout',
      'compact'
    );
    for (const label of ['Home', 'Music', 'Shows', 'About', 'Menu']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Release credits' }));
    expect(
      await screen.findByRole('heading', { name: 'Credits' })
    ).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('profile-drawer-overlay'));

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(
      await screen.findByRole('menuitem', { name: 'Share Profile' })
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Pay' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Contact' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Pay' }));
    expect(
      await screen.findByRole('button', { name: 'Custom Amount' })
    ).toBeInTheDocument();

    cleanup();
    render(<CookieBannerSection testOnlyPathname='/timwhite' />);
    expect(
      screen.getByRole('complementary', { name: 'Cookie Consent' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(
      await screen.findByText('Manage your cookie preferences')
    ).toBeInTheDocument();
    cleanup();
    installMatchMedia(true);
    render(
      <StaticArtistPage
        mode='profile'
        artist={artist}
        socialLinks={socialLinks}
        contacts={contacts}
        subtitle='Music, releases & updates'
        showBackButton={false}
        showPayButton
        allowFanCapture
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('public-profile-layout-shell')).toHaveAttribute(
        'data-layout',
        'desktop'
      );
      expect(screen.getAllByText('Get updates').length).toBeGreaterThan(0);
    });

    const pageSource = readFileSync(
      path.resolve(process.cwd(), 'app/[username]/page.tsx'),
      'utf8'
    );
    expect(pageSource).toContain('<StaticArtistPage');
    expect(pageSource).not.toContain('PublicProfileTemplate');
    expect(pageSource).not.toContain('PublicProfileTemplateV2');
    expect(pageSource).not.toContain('AnimatedArtistPage');
  });
});
