import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileUnifiedDrawer } from '@/features/profile/ProfileUnifiedDrawer';
import type { PublicContact } from '@/types/contacts';
import type { Artist } from '@/types/db';

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

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    getActionHref: () => 'mailto:mgmt@example.com',
    trackAction: vi.fn(),
  }),
}));

const mockArtist: Artist = {
  id: 'artist-1',
  name: 'Tim White',
  handle: 'tim',
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

const managementContact: PublicContact = {
  id: 'mgmt-1',
  role: 'management',
  roleLabel: 'Management',
  territorySummary: 'Worldwide',
  territoryCount: 0,
  contactName: 'Kelly Strickland',
  primaryContactLabel: 'Kelly Strickland',
  companyLabel: undefined,
  secondaryLabel: undefined,
  channels: [{ type: 'email', encoded: 'enc', preferred: true }],
};

describe('ProfileUnifiedDrawer — contact person name', () => {
  // Regression: ISSUE-002 — compact contact drawer omitted person names
  // Found by /qa on 2026-08-17
  // Report: .gstack/qa-reports/qa-report-localhost-3100-2026-08-17.md

  afterEach(() => {
    cleanup();
  });

  it('renders the management person name in the compact contact list', () => {
    render(
      <ProfileUnifiedDrawer
        open
        onOpenChange={vi.fn()}
        view='contact'
        onViewChange={vi.fn()}
        artist={mockArtist}
        socialLinks={[]}
        contacts={[managementContact]}
        primaryChannel={contact => contact.channels[0]}
        dsps={[]}
        isSubscribed={false}
        contentPrefs={{
          newMusic: true,
          tourDates: true,
          merch: true,
          general: true,
        }}
        onTogglePref={vi.fn()}
        onUnsubscribe={vi.fn()}
        isUnsubscribing={false}
        hasTip={false}
        hasContacts
        hasTourDates={false}
        hasReleases={false}
        shareContext={{
          surfaceType: 'profile',
          title: 'Tim White',
          canonicalUrl: 'https://example.com/tim',
          displayUrl: 'example.com/tim',
          imageUrl: null,
          preparedText: 'Check out Tim White',
          emailSubject: 'Tim White on Jovie',
          emailBody: 'Link inside',
          asset: {
            kind: 'story',
            url: 'https://example.com/art.png',
            fileName: 'art.png',
            mimeType: 'image/png',
            width: 1080,
            height: 1920,
          },
          utmContext: {
            baseUrl: 'https://example.com/tim',
            releaseSlug: 'never-say-a-word',
          },
        }}
      />
    );

    expect(screen.getByText('Management')).toBeTruthy();
    expect(
      screen.getByTestId('profile-mode-drawer-contact-meta').textContent
    ).toBe('Kelly Strickland');
  });
});
