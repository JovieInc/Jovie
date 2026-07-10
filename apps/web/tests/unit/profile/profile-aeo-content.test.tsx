import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfileAeoContent } from '@/features/profile/ProfileAeoContent';
import type { PublicMerchCard } from '@/lib/merch/types';
import {
  buildProfileAeoContent,
  type ProfileAeoContent as ProfileAeoContentModel,
} from '@/lib/profile/aeo-content';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { Artist, LegacySocialLink } from '@/types/db';

const now = new Date('2026-06-18T00:00:00.000Z');

const baseArtist: Artist = {
  id: 'artist-1',
  owner_user_id: 'owner-1',
  handle: 'dj-test',
  spotify_id: 'spotify-artist-1',
  name: 'DJ Test',
  image_url: 'https://example.com/avatar.jpg',
  tagline:
    'DJ Test builds late-night club records around vocal hooks and left-field percussion.',
  spotify_url: 'https://open.spotify.com/artist/test',
  apple_music_url: 'https://music.apple.com/artist/test',
  youtube_url: 'https://youtube.com/@djtest',
  location: 'Los Angeles, CA',
  hometown: 'Austin, TX',
  active_since_year: 2018,
  genres: ['tech house', 'club'],
  career_highlights: 'Grammy-nominated remixer with festival mainstage slots.',
  target_playlists: ['Dance Rising', 'mint'],
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2024-01-01T00:00:00.000Z',
};

const socialLinks: LegacySocialLink[] = [
  {
    id: 'link-1',
    artist_id: 'artist-1',
    platform: 'spotify',
    url: 'https://open.spotify.com/artist/test',
    clicks: 0,
    created_at: '2024-01-01T00:00:00.000Z',
  },
];

const tourDates: TourDateViewModel[] = [
  {
    id: 'tour-1',
    profileId: 'artist-1',
    externalId: 'bit-1',
    provider: 'bandsintown',
    eventType: 'tour',
    confirmationStatus: 'confirmed',
    reviewedAt: null,
    title: null,
    startDate: '2026-07-04T20:00:00.000Z',
    startTime: null,
    timezone: null,
    venueName: 'Warehouse 9',
    city: 'Brooklyn',
    region: 'NY',
    country: 'US',
    latitude: null,
    longitude: null,
    ticketUrl: 'https://tickets.example.com/dj-test',
    ticketStatus: 'available',
    lastSyncedAt: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
];

const merchCards = [
  {
    id: 'merch-1',
    title: 'Signal Hoodie',
    productType: 'hoodie',
    retailPriceCents: 6800,
  },
] as unknown as PublicMerchCard[];

function buildContent(): ProfileAeoContentModel {
  return buildProfileAeoContent({
    artist: baseArtist,
    genres: ['tech house', 'electronic'],
    latestRelease: {
      title: 'Neon Circuit',
      slug: 'neon-circuit',
      releaseType: 'single',
      releaseDate: '2026-05-01T00:00:00.000Z',
    },
    releases: [
      {
        id: 'release-1',
        title: 'Neon Circuit',
        slug: 'neon-circuit',
        releaseType: 'single',
        releaseDate: '2026-05-01T00:00:00.000Z',
        artworkUrl: 'https://example.com/neon.jpg',
        artistNames: ['DJ Test', 'Guest Vocalist'],
      },
      {
        id: 'release-2',
        title: 'Late Signal',
        slug: 'late-signal',
        releaseType: 'ep',
        releaseDate: '2025-09-01T00:00:00.000Z',
        artworkUrl: null,
        artistNames: ['DJ Test'],
      },
    ],
    tourDates,
    merchCards,
    socialLinks,
    now,
  });
}

describe('Profile AEO content', () => {
  afterEach(cleanup);

  it('keeps dark AEO and light claim-card colors stable across app themes', () => {
    const css = readFileSync(
      join(process.cwd(), 'styles', 'design-system.css'),
      'utf8'
    );

    expect(css).toMatch(
      /\.profile-aeo-content\)[\s\S]*?--profile-aeo-text:\s*var\(--color-text-tooltip\)/
    );
    expect(css).toMatch(
      /\.profile-aeo-claim-card\)[\s\S]*?--profile-aeo-claim-ink:\s*var\(--system-b-cinematic-black\)/
    );
  });

  it('builds per-artist description and the four sourced canonical FAQ answers', () => {
    const content = buildContent();

    expect(content.description.join(' ')).toContain('DJ Test');
    expect(content.description.join(' ')).toContain('tech house');
    expect(content.description.join(' ')).toContain('Austin, TX');
    expect(content.description.join(' ')).toContain('active since 2018');
    expect(content.description.join(' ')).toContain('Neon Circuit');
    expect(content.description.join(' ')).toContain('Guest Vocalist');
    expect(content.description.join(' ')).toContain('Grammy-nominated');

    expect(content.faqs.map(faq => faq.question)).toEqual([
      'Where is DJ Test from?',
      "What is DJ Test's latest release?",
      'Is DJ Test touring?',
      'Where can I buy DJ Test merch?',
    ]);

    for (const faq of content.faqs) {
      expect(faq.answer).toContain('DJ Test');
      expect(faq.source.href).toMatch(/^https?:\/\//);
      expect(faq.source.label.length).toBeGreaterThan(0);
    }

    expect(content.faqs[1]?.answer).toContain('May 1, 2026');
    expect(content.faqs[1]?.source.href).toBe(
      'https://jov.ie/dj-test/neon-circuit'
    );
    expect(content.faqs[2]?.answer).toContain('Warehouse 9');
    expect(content.faqs[2]?.source.href).toBe(
      'https://tickets.example.com/dj-test'
    );
    expect(content.faqs[3]?.answer).toContain('Signal Hoodie');
    expect(content.faqs[3]?.answer).toContain('$68.00');
  });

  it('keeps sparse profiles unique and sourced instead of using duplicate boilerplate', () => {
    const first = buildProfileAeoContent({
      artist: {
        ...baseArtist,
        id: 'artist-sparse-1',
        handle: 'first-artist',
        name: 'First Artist',
        tagline: undefined,
        spotify_url: undefined,
        apple_music_url: undefined,
        youtube_url: undefined,
        location: null,
        hometown: null,
        active_since_year: null,
        genres: null,
        career_highlights: null,
        target_playlists: null,
      },
      now,
    });
    const second = buildProfileAeoContent({
      artist: {
        ...baseArtist,
        id: 'artist-sparse-2',
        handle: 'second-artist',
        name: 'Second Artist',
        tagline: undefined,
        spotify_url: undefined,
        apple_music_url: undefined,
        youtube_url: undefined,
        location: null,
        hometown: null,
        active_since_year: null,
        genres: null,
        career_highlights: null,
        target_playlists: null,
      },
      now,
    });

    expect(first.description.join(' ')).not.toBe(second.description.join(' '));
    expect(first.description.join(' ')).toContain('@first-artist');
    expect(second.description.join(' ')).toContain('@second-artist');
    expect(first.faqs).toHaveLength(4);
    expect(
      first.faqs.every(faq => faq.source.href.startsWith('https://jov.ie/'))
    ).toBe(true);
  });

  it('renders visible FAQ and source links into static HTML', () => {
    const content = buildContent();

    render(<ProfileAeoContent content={content} />);

    expect(screen.getByTestId('profile-aeo-content')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'About DJ Test' })
    ).toBeVisible();
    expect(screen.getByText('Where is DJ Test from?')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Source: Jovie release page' })
    ).toHaveAttribute('href', 'https://jov.ie/dj-test/neon-circuit');

    const html = renderToStaticMarkup(<ProfileAeoContent content={content} />);
    expect(html).toContain('data-testid="profile-aeo-content"');
    expect(html).toContain('Where can I buy DJ Test merch?');
    expect(html).toContain('Source: Official merch card');
  });

  it('renders the editorial claim card only when a claim destination is provided', () => {
    const content = buildContent();
    const { rerender } = render(
      <ProfileAeoContent
        content={content}
        claimHref='/dj-test/claim?next=auth'
      />
    );

    expect(screen.getByTestId('profile-aeo-claim-card')).toBeVisible();
    expect(
      screen.getByRole('heading', {
        name: 'jov.ie/you',
      })
    ).toBeVisible();
    expect(screen.getByText('Free · Spotify verified')).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: 'Claim the DJ Test profile and sign up for Jovie',
      })
    ).toHaveAttribute('href', '/dj-test/claim?next=auth');

    rerender(<ProfileAeoContent content={content} />);
    expect(screen.queryByTestId('profile-aeo-claim-card')).toBeNull();
  });
});
