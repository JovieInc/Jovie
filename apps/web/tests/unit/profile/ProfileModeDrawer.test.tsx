import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicContact } from '@/types/contacts';
import type { Artist } from '@/types/db';

vi.mock('@/features/profile/ProfileDrawerShell', () => ({
  ProfileDrawerShell: ({
    title,
    children,
    dataTestId,
  }: {
    readonly title: string;
    readonly children: React.ReactNode;
    readonly dataTestId?: string;
  }) => (
    <div data-testid={dataTestId ?? 'profile-drawer-shell'}>
      <div>{title}</div>
      {children}
    </div>
  ),
}));

vi.mock('@/features/profile/AboutSection', () => ({
  AboutSection: () => <div data-testid='about-section'>About content</div>,
}));

vi.mock('@/features/profile/TourModePanel', () => ({
  TourDrawerContent: () => (
    <div data-testid='tour-drawer-content'>Tour content</div>
  ),
}));

vi.mock('@/features/profile/StaticListenInterface', () => ({
  StaticListenInterface: () => (
    <div data-testid='static-listen-interface'>Listen content</div>
  ),
}));

vi.mock(
  '@/features/profile/artist-notifications-cta/ArtistNotificationsCTA',
  () => ({
    ArtistNotificationsCTA: () => (
      <div data-testid='artist-notifications'>Subscribe content</div>
    ),
  })
);

vi.mock(
  '@/features/profile/artist-notifications-cta/TwoStepNotificationsCTA',
  () => ({
    TwoStepNotificationsCTA: () => (
      <div data-testid='two-step-notifications'>Subscribe content</div>
    ),
  })
);

vi.mock('@/features/profile/artist-notifications-cta', () => ({
  TwoStepNotificationsCTA: () => (
    <div data-testid='two-step-notifications'>Subscribe content</div>
  ),
  ArtistNotificationsCTA: () => (
    <div data-testid='artist-notifications'>Subscribe content</div>
  ),
}));

vi.mock('@/components/molecules/PaySelector', () => ({
  PaySelector: () => <div data-testid='pay-selector'>Pay content</div>,
}));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    getActionHref: () => 'mailto:test@example.com',
    trackAction: vi.fn(),
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

const mockArtist: Artist = {
  id: 'artist-1',
  name: 'Test Artist',
  handle: 'testartist',
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
};

const mockContacts: PublicContact[] = [
  {
    id: 'contact-1',
    role: 'manager',
    roleLabel: 'Manager',
    secondaryLabel: 'Team',
    primaryContactLabel: 'Taylor Lee',
    territorySummary: 'US',
    territoryCount: 1,
    channels: [{ type: 'email', encoded: 'encoded-email' }],
  },
];

describe('ProfileModeDrawer', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the about drawer body for about mode', async () => {
    const { ProfileModeDrawer } = await import(
      '@/features/profile/ProfileModeDrawer'
    );

    render(
      <ProfileModeDrawer
        activeMode='about'
        onOpenChange={() => {}}
        artist={mockArtist}
        socialLinks={[]}
        contacts={mockContacts}
        primaryChannel={contact => contact.channels[0]!}
        dsps={[]}
      />
    );

    expect(screen.getByTestId('profile-mode-drawer')).toBeDefined();
    expect(screen.getByTestId('profile-mode-drawer-about')).toBeDefined();
    expect(screen.getByTestId('about-section')).toBeDefined();
  });

  it('renders contact actions for contact mode', async () => {
    const { ProfileModeDrawer } = await import(
      '@/features/profile/ProfileModeDrawer'
    );

    render(
      <ProfileModeDrawer
        activeMode='contact'
        onOpenChange={() => {}}
        artist={mockArtist}
        socialLinks={[]}
        contacts={mockContacts}
        primaryChannel={contact => contact.channels[0]!}
        dsps={[]}
      />
    );

    expect(screen.getByTestId('profile-mode-drawer-contact')).toBeDefined();
    expect(screen.getByTestId('contact-drawer-item')).toBeDefined();
  });

  it('renders subscribe mode inside the shared drawer', async () => {
    const { ProfileModeDrawer } = await import(
      '@/features/profile/ProfileModeDrawer'
    );

    render(
      <ProfileModeDrawer
        activeMode='subscribe'
        onOpenChange={() => {}}
        artist={mockArtist}
        socialLinks={[]}
        contacts={mockContacts}
        primaryChannel={contact => contact.channels[0]!}
        dsps={[]}
        subscribeTwoStep
      />
    );

    expect(screen.getByTestId('profile-mode-drawer-subscribe')).toBeDefined();
    expect(screen.getByTestId('two-step-notifications')).toBeDefined();
  });

  it('renders tour mode inside the shared drawer', async () => {
    const { ProfileModeDrawer } = await import(
      '@/features/profile/ProfileModeDrawer'
    );

    render(
      <ProfileModeDrawer
        activeMode='tour'
        onOpenChange={() => {}}
        artist={mockArtist}
        socialLinks={[]}
        contacts={mockContacts}
        primaryChannel={contact => contact.channels[0]!}
        dsps={[]}
      />
    );

    expect(screen.getByTestId('profile-mode-drawer-tour')).toBeDefined();
    expect(screen.getByTestId('tour-drawer-content')).toBeDefined();
    expect(screen.queryByTestId('about-section')).toBeNull();
  });
});
