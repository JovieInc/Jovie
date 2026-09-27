import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicContact } from '@/types/contacts';
import type { Artist } from '@/types/db';
import { ProfileUnifiedDrawer } from './ProfileUnifiedDrawer';

vi.mock('@/features/profile/ProfileDrawerShell', () => ({
  ProfileDrawerShell: ({
    children,
    dataTestId,
  }: {
    readonly children: React.ReactNode;
    readonly dataTestId?: string;
  }) => (
    <div data-testid={dataTestId ?? 'profile-drawer-shell'}>{children}</div>
  ),
}));

vi.mock('@/features/profile/AboutSection', () => ({
  AboutSection: (props: {
    readonly creditSegments?: readonly { readonly type: string }[];
    readonly contacts?: readonly { readonly id: string }[];
  }) => (
    <div
      data-testid='about-section'
      data-credit-segments={(props.creditSegments ?? [])
        .map(segment => segment.type)
        .join('|')}
      data-contacts={(props.contacts ?? [])
        .map(contact => contact.id)
        .join('|')}
    />
  ),
}));

vi.mock('@/features/profile/views/MenuView', () => ({
  MenuView: () => <div data-testid='menu-view' />,
}));

vi.mock('@/features/profile/views/ReleasesView', () => ({
  ReleasesView: () => <div data-testid='releases-view' />,
}));

vi.mock('@/features/profile/TourModePanel', () => ({
  TourDrawerContent: () => <div data-testid='tour-drawer-content' />,
}));

vi.mock('@/features/profile/StaticListenInterface', () => ({
  StaticListenInterface: () => <div data-testid='static-listen-interface' />,
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: () => <div data-testid='artist-notifications' />,
  })
);

vi.mock(
  '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA',
  () => ({
    TwoStepNotificationsCTA: () => <div data-testid='two-step-notifications' />,
  })
);

vi.mock('@/components/molecules/TipSelector', () => ({
  TipSelector: () => <div data-testid='tip-selector' />,
}));

vi.mock('@/components/molecules/PaySelector', () => ({
  PaySelector: () => <div data-testid='pay-selector' />,
}));

vi.mock('@/features/share/PublicShareMenu', () => ({
  PublicShareActionList: () => <div data-testid='public-share-action-list' />,
}));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    getActionHref: () => 'mailto:test@example.com',
    trackAction: vi.fn(),
  }),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const artist = {
  id: 'artist-1',
  name: 'Tim White',
  handle: 'timwhite',
  image_url: null,
  tagline: 'Producer.',
  location: null,
  hometown: null,
  career_highlights: null,
  is_verified: true,
  active_since_year: null,
  published: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-04-24T00:00:00.000Z',
} satisfies Artist;

const bookingContact: PublicContact = {
  id: 'contact-1',
  role: 'bookings',
  roleLabel: 'Booking',
  territorySummary: 'Worldwide',
  territoryCount: 1,
  channels: [{ type: 'email', encoded: 'bW9va0BleGFtcGxlLmNvbQ==' }],
};

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  onViewChange: vi.fn(),
  artist,
  socialLinks: [],
  contacts: [bookingContact],
  primaryChannel: vi.fn() as never,
  dsps: [],
  isSubscribed: false,
  contentPrefs: { newMusic: true, tourDates: true, merch: true, general: true },
  onTogglePref: vi.fn(),
  onUnsubscribe: vi.fn(),
  isUnsubscribing: false,
  shareContext: undefined as never,
  hasTip: false,
  hasContacts: true,
  hasTourDates: false,
  hasReleases: false,
};

describe('ProfileUnifiedDrawer', () => {
  afterEach(() => cleanup());

  it('routes selected credits and contacts into the About destination (JOV-6199)', () => {
    render(
      <ProfileUnifiedDrawer
        {...baseProps}
        view='about'
        creditSegments={[
          { type: 'text', text: 'Credited on "' },
          {
            type: 'release',
            text: 'Neon Circuit',
            href: '/timwhite/neon-circuit',
          },
          { type: 'text', text: '".' },
        ]}
      />
    );

    const about = screen.getByTestId('profile-mode-drawer-about');
    expect(about).toBeInTheDocument();
    const section = screen.getByTestId('about-section');
    expect(section).toHaveAttribute(
      'data-credit-segments',
      'text|release|text'
    );
    expect(section).toHaveAttribute('data-contacts', 'contact-1');
  });

  it('omits credits and contacts from About when the profile has none', () => {
    render(<ProfileUnifiedDrawer {...baseProps} view='about' contacts={[]} />);

    const section = screen.getByTestId('about-section');
    expect(section).toHaveAttribute('data-credit-segments', '');
    expect(section).toHaveAttribute('data-contacts', '');
  });
});
