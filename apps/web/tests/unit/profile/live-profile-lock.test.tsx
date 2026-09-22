import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileCompactTemplate } from '@/features/profile/templates/ProfileCompactTemplate';
import type { Artist } from '@/types/db';

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    readonly children: React.ReactNode;
    readonly href: string;
  }) => React.createElement('a', { href, ...props }, children),
}));

vi.mock('@/hooks/useIsAuthenticated', () => ({
  useIsAuthenticated: () => false,
}));

vi.mock('@/lib/queries/useNotificationStatusQuery', () => ({
  useUnsubscribeNotificationsMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useUpdateContentPreferencesMutation: () => ({ mutate: vi.fn() }),
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

describe('live public profile lock', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the compact profile journeys, including release credits', async () => {
    render(
      <ProfileCompactTemplate
        mode='profile'
        artist={artist}
        socialLinks={[]}
        contacts={[]}
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
    );

    for (const label of ['Home', 'Music', 'Shows', 'About', 'Menu']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Release credits' }));
    expect(
      await screen.findByRole('heading', { name: 'Credits' })
    ).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Producer')).toBeInTheDocument();

    const pageSource = readFileSync(
      path.resolve(process.cwd(), 'app/[username]/page.tsx'),
      'utf8'
    );
    const staticSource = readFileSync(
      path.resolve(
        process.cwd(),
        'components/features/profile/StaticArtistPage.tsx'
      ),
      'utf8'
    );
    expect(pageSource).toContain('releaseCredits={releaseCredits}');
    expect(pageSource).toContain('<StaticArtistPage');
    expect(pageSource).not.toContain('PublicProfileTemplate');
    expect(pageSource).not.toContain('AnimatedArtistPage');
    expect(staticSource).toContain('releaseCredits={releaseCredits}');
    expect(staticSource).toContain('<ProfileCompactTemplate');
    expect(staticSource).not.toContain('PublicProfileTemplate');
  });
});
