import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { ProfileAeoContent } from '@/features/profile/ProfileAeoContent';
import { projectStructuredReleaseCollaborators } from '@/lib/discography/artist-queries/artist-search';
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
    releaseCollaborators: [
      {
        artistId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
        name: 'Guest Vocalist',
        href: '/artists/f5441adb-6789-449a-9553-ab7460c9c61c',
        profileState: 'unclaimed',
        role: 'featured_artist',
        releaseId: 'release-1',
        releaseTitle: 'Neon Circuit',
        releaseSlug: 'neon-circuit',
        releaseDate: new Date('2026-05-01T00:00:00.000Z'),
        position: 1,
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
    expect(css).toMatch(
      /\.profile-aeo-claim-card__domain\)[\s\S]*?var\(--profile-aeo-claim-ink\)\s+(?:4[8-9]|[5-9]\d|100)%/
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
      expect(faq.source.href.length).toBeGreaterThan(0);
      expect(faq.source.label.length).toBeGreaterThan(0);
    }

    expect(content.faqs[1]?.answer).toContain('May 1, 2026');
    expect(content.faqs[1]?.source.href).toBe('/dj-test/neon-circuit');
    expect(content.faqs[2]?.answer).toContain('Warehouse 9');
    expect(content.faqs[2]?.source.href).toBe(
      'https://tickets.example.com/dj-test'
    );
    expect(content.faqs[3]?.answer).toContain('Signal Hoodie');
    expect(content.faqs[3]?.answer).toContain('$68.00');

    // Copy quality: no generic pronoun boilerplate or awkward "working in".
    expect(content.description.join(' ')).not.toContain('Their public Jovie');
    expect(content.description.join(' ')).toContain('known for');
    expect(content.description.join(' ')).toContain('Find DJ Test on Jovie');
  });

  it('builds the facts strip from genres, active year, hometown, and based-in', () => {
    const content = buildContent();

    expect(content.facts).toEqual([
      { label: 'Genre', value: 'Tech house, electronic, club' },
      { label: 'Active Since', value: '2018' },
      { label: 'Hometown', value: 'Austin, TX' },
      { label: 'Based In', value: 'Los Angeles, CA' },
    ]);
  });

  it('uses based-in when only current location is set', () => {
    const content = buildProfileAeoContent({
      artist: { ...baseArtist, hometown: null, location: 'Berlin, DE' },
      now,
    });

    expect(content.facts).toContainEqual({
      label: 'Based In',
      value: 'Berlin, DE',
    });
    expect(content.facts.some(fact => fact.label === 'Hometown')).toBe(false);

    const withHometown = buildProfileAeoContent({ artist: baseArtist, now });
    expect(withHometown.facts).toContainEqual({
      label: 'Hometown',
      value: 'Austin, TX',
    });
  });

  it('omits the facts strip fields that have no data', () => {
    const content = buildProfileAeoContent({
      artist: {
        ...baseArtist,
        hometown: null,
        location: null,
        active_since_year: null,
        genres: null,
      },
      now,
    });

    expect(content.facts).toEqual([]);
  });

  it('splits social links into listen (DSP) and follow (non-DSP) rows', () => {
    const content = buildProfileAeoContent({
      artist: baseArtist,
      socialLinks: [
        ...socialLinks,
        {
          id: 'link-2',
          artist_id: 'artist-1',
          platform: 'instagram',
          url: 'https://instagram.com/djtest',
          clicks: 0,
          created_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'link-3',
          artist_id: 'artist-1',
          platform: 'youtube',
          url: 'https://youtube.com/@djtest',
          clicks: 0,
          created_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'link-4',
          artist_id: 'artist-1',
          platform: 'venmo',
          url: 'https://venmo.com/djtest',
          clicks: 0,
          created_at: '2024-01-01T00:00:00.000Z',
        },
      ],
      now,
    });

    expect(content.listenLinks.map(link => link.label)).toEqual([
      'Spotify',
      'Apple Music',
    ]);
    expect(content.listenLinks[0]?.url).toBe(
      'https://open.spotify.com/artist/test'
    );
    // The apple_music_url profile column fills in the missing DSP link.
    expect(content.listenLinks[1]?.url).toBe(
      'https://music.apple.com/artist/test'
    );
    // A YouTube social link is categorized as follow, not listen, and
    // suppresses the youtube_url column fallback.
    // Venmo is support/payment — excluded from Follow.
    expect(content.followLinks.map(link => link.platform)).toEqual([
      'instagram',
      'youtube',
    ]);
    // Registry names win; unknown platforms fall back to sentence case.
    expect(content.followLinks.map(link => link.label)).toEqual([
      'Instagram',
      'YouTube',
    ]);
  });

  it('suppresses malformed website links and uses Visit aria copy for websites', () => {
    const content = buildProfileAeoContent({
      artist: baseArtist,
      socialLinks: [
        {
          id: 'link-web-bad',
          artist_id: 'artist-1',
          platform: 'website',
          url: 'https://itstimwhite/',
          clicks: 0,
          created_at: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'link-web-good',
          artist_id: 'artist-1',
          platform: 'website',
          url: 'https://itstimwhite.com',
          clicks: 0,
          created_at: '2024-01-01T00:00:00.000Z',
        },
      ],
      now,
    });

    // Malformed URL is skipped before platform dedupe; valid website remains.
    expect(content.followLinks.map(link => link.platform)).toEqual(['website']);
    expect(content.followLinks[0]?.url).toBe('https://itstimwhite.com/');

    render(<ProfileAeoContent content={content} />);
    expect(
      screen.getByRole('link', { name: "Visit DJ Test's website" })
    ).toHaveAttribute('href', 'https://itstimwhite.com/');
  });

  it('omits empty touring and merch FAQs from the public surface', () => {
    const content = buildProfileAeoContent({
      artist: baseArtist,
      tourDates: [],
      merchCards: [],
      now,
    });

    expect(content.faqs.map(faq => faq.question)).toEqual([
      'Where is DJ Test from?',
      "What is DJ Test's latest release?",
    ]);
    expect(content.faqs.some(faq => faq.question.includes('touring'))).toBe(
      false
    );
    expect(content.faqs.some(faq => faq.question.includes('merch'))).toBe(
      false
    );
  });

  it('uses profile DSP URL columns for the listen row when no social links exist', () => {
    const content = buildProfileAeoContent({
      artist: baseArtist,
      socialLinks: [],
      now,
    });

    expect(content.listenLinks.map(link => link.platform)).toEqual([
      'spotify',
      'apple_music',
      'youtube',
    ]);
    expect(content.followLinks).toEqual([]);
  });

  it('renders the facts strip, listen, follow, and share controls', () => {
    const content = buildProfileAeoContent({
      artist: baseArtist,
      genres: ['tech house'],
      socialLinks: [
        ...socialLinks,
        {
          id: 'link-2',
          artist_id: 'artist-1',
          platform: 'instagram',
          url: 'https://instagram.com/djtest',
          clicks: 0,
          created_at: '2024-01-01T00:00:00.000Z',
        },
      ],
      now,
    });

    render(<ProfileAeoContent content={content} />);

    const facts = screen.getByTestId('profile-about-facts');
    expect(facts).toBeVisible();
    expect(facts).toHaveTextContent('Genre');
    expect(facts).toHaveTextContent('Active Since');
    expect(facts).toHaveTextContent('Hometown');
    expect(facts).toHaveTextContent('Based In');
    expect(facts.querySelectorAll('dt')).toHaveLength(4);
    expect(facts.querySelectorAll('dd')).toHaveLength(4);
    for (const definition of facts.querySelectorAll('dd')) {
      expect(definition.firstElementChild).toHaveClass(
        'profile-aeo-content__fact-value'
      );
    }

    const listen = screen.getByTestId('profile-about-listen');
    expect(listen).toBeVisible();
    const spotifyLink = screen.getByRole('link', {
      name: 'Listen to DJ Test on Spotify (opens in a new tab)',
    });
    expect(spotifyLink).toHaveAttribute(
      'href',
      'https://open.spotify.com/artist/test'
    );
    expect(spotifyLink).toHaveAttribute('target', '_blank');
    expect(spotifyLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(spotifyLink).toHaveClass('h-11', 'w-11');
    expect(spotifyLink).not.toHaveTextContent(/^Spotify$/);

    const appleMusicLink = screen.getByRole('link', {
      name: 'Listen to DJ Test on Apple Music (opens in a new tab)',
    });
    expect(appleMusicLink).toHaveAttribute(
      'href',
      'https://music.apple.com/artist/test'
    );
    expect(appleMusicLink).toHaveClass('h-11', 'w-11');

    const follow = screen.getByTestId('profile-about-follow');
    expect(follow).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Follow DJ Test on Instagram' })
    ).toHaveAttribute('href', 'https://instagram.com/djtest');

    expect(screen.getByTestId('profile-about-share')).toBeVisible();
  });

  it('keeps every canonical music service icon-only, named, and 44px', () => {
    const services = [
      ['soundcloud', 'SoundCloud', 'https://soundcloud.com/dj-test'],
      ['spotify', 'Spotify', 'https://open.spotify.com/artist/test'],
      ['apple_music', 'Apple Music', 'https://music.apple.com/artist/test'],
      [
        'youtube_music',
        'YouTube Music',
        'https://music.youtube.com/channel/test',
      ],
      ['amazon_music', 'Amazon Music', 'https://music.amazon.com/artists/test'],
      ['tidal', 'Tidal', 'https://tidal.com/browse/artist/test'],
      ['deezer', 'Deezer', 'https://www.deezer.com/artist/test'],
      ['netease', 'NetEase Music', 'https://music.163.com/artist?id=1'],
      ['qq_music', 'QQ Music', 'https://y.qq.com/n/ryqq/singer/test'],
    ] as const;
    const content = buildProfileAeoContent({
      artist: {
        ...baseArtist,
        spotify_url: undefined,
        apple_music_url: undefined,
        youtube_url: undefined,
      },
      socialLinks: services.map(([platform, , url], index) => ({
        id: `service-${index}`,
        artist_id: baseArtist.id,
        platform,
        url,
        clicks: 0,
        created_at: '2024-01-01T00:00:00.000Z',
      })),
      now,
    });

    expect(content.listenLinks.map(link => link.label)).toEqual(
      services.map(([, label]) => label)
    );

    render(<ProfileAeoContent content={content} />);

    for (const [, label, url] of services) {
      const accessibleName = `Listen to DJ Test on ${label} (opens in a new tab)`;
      const link = screen.getByRole('link', { name: accessibleName });
      expect(link).toHaveAttribute('href', url);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveClass('h-11', 'w-11');
      expect(link.querySelector('.sr-only')).toHaveTextContent(accessibleName);
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(link.querySelector('svg')).toHaveAttribute('fill', 'currentColor');
    }
  });

  it('keeps long localized fact values inside the semantic badge grid', () => {
    const longLocation =
      '東京都渋谷区神宮前・Berlin Kreuzberg・مدينة لوس أنجلوس الطويلة';
    const content = buildProfileAeoContent({
      artist: {
        ...baseArtist,
        hometown: longLocation,
        location: null,
      },
      genres: ['música electrónica experimental de larga duración'],
      now,
    });

    render(<ProfileAeoContent content={content} />);

    const facts = screen.getByTestId('profile-about-facts');
    const locationValue = screen.getByTitle(longLocation);
    expect(facts.tagName).toBe('DL');
    expect(facts).toHaveClass(
      'grid-cols-2',
      'sm:grid-cols-3',
      'lg:grid-cols-2'
    );
    expect(locationValue.parentElement).toHaveClass('max-w-full');
    expect(locationValue).toHaveClass('min-w-0', 'truncate');
    expect(locationValue.closest('dd')).not.toBeNull();
  });

  it('hides the facts, listen, and follow sections when there is no data', () => {
    const content = buildProfileAeoContent({
      artist: {
        ...baseArtist,
        hometown: null,
        location: null,
        active_since_year: null,
        genres: null,
        spotify_url: undefined,
        apple_music_url: undefined,
        youtube_url: undefined,
      },
      socialLinks: [],
      now,
    });

    render(<ProfileAeoContent content={content} />);

    expect(screen.queryByTestId('profile-about-facts')).toBeNull();
    expect(screen.queryByTestId('profile-about-listen')).toBeNull();
    expect(screen.queryByTestId('profile-about-follow')).toBeNull();
    expect(screen.getByTestId('profile-about-share')).toBeVisible();
    expect(screen.getByTestId('profile-aeo-content')).toBeVisible();
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
    // Sparse profiles only keep origin + latest-release FAQs (no empty tour/merch).
    expect(first.faqs).toHaveLength(2);
    expect(
      first.faqs.every(
        faq =>
          faq.source.href.startsWith('/') ||
          faq.source.href.startsWith('https://')
      )
    ).toBe(true);
    // Same-origin FAQ sources stay environment-relative (no hard-coded prod).
    expect(first.faqs[0]?.source.href).toBe('/first-artist');
  });

  it('renders visible FAQ and source links into static HTML', () => {
    const content = buildContent();

    render(<ProfileAeoContent content={content} />);

    expect(screen.getByTestId('profile-aeo-content')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'About DJ Test' })
    ).toBeVisible();
    expect(screen.getByText('Where is DJ Test from?')).toBeVisible();
    const releaseSource = screen.getByRole('link', {
      name: 'Source: Jovie release page',
    });
    expect(releaseSource).toHaveAttribute('href', '/dj-test/neon-circuit');
    expect(releaseSource).toHaveClass('min-h-11');

    const html = renderToStaticMarkup(<ProfileAeoContent content={content} />);
    expect(html).toContain('data-testid="profile-aeo-content"');
    expect(html).toContain('Where can I buy DJ Test merch?');
    expect(html).toContain('Source: Official merch card');
    expect(
      screen.getByRole('link', { name: 'Guest Vocalist' })
    ).toHaveAttribute('href', '/artists/f5441adb-6789-449a-9553-ab7460c9c61c');
  });

  it('links entity mentions in the description while keeping plain-text paragraphs', () => {
    const content = buildProfileAeoContent({
      artist: {
        ...baseArtist,
        tagline:
          'DJ Test broke through with "Neon Circuit" and tours with Guest Vocalist.',
      },
      genres: ['tech house'],
      releases: [
        {
          id: 'release-1',
          title: 'Neon Circuit',
          slug: 'neon-circuit',
          releaseType: 'single',
          releaseDate: '2026-05-01T00:00:00.000Z',
          artworkUrl: null,
          artistNames: ['DJ Test', 'Guest Vocalist'],
        },
      ],
      entityMentions: {
        ownHandle: 'dj-test',
        releases: [{ title: 'Neon Circuit', slug: 'neon-circuit' }],
        artists: [{ name: 'Guest Vocalist', handle: 'guestvocalist' }],
      },
      now,
    });

    // Plain-text accessor is unchanged for meta/JSON-LD consumers.
    expect(content.description.join(' ')).toContain('Neon Circuit');

    const linkedSegments = content.descriptionSegments
      .flat()
      .filter(segment => segment.type !== 'text');
    expect(linkedSegments).toContainEqual({
      type: 'release',
      text: 'Neon Circuit',
      href: '/dj-test/neon-circuit',
    });
    expect(linkedSegments).toContainEqual({
      type: 'artist',
      text: 'Guest Vocalist',
      href: '/guestvocalist',
    });

    render(<ProfileAeoContent content={content} />);

    // The release title appears in both the tagline and the generated
    // latest-release sentence — every mention is linked.
    const releaseLinks = screen.getAllByRole('link', { name: 'Neon Circuit' });
    expect(releaseLinks.length).toBeGreaterThan(0);
    for (const link of releaseLinks) {
      expect(link).toHaveAttribute('href', '/dj-test/neon-circuit');
      expect(link).toHaveAttribute('data-entity-kind', 'release');
    }

    const artistLinks = screen.getAllByRole('link', {
      name: 'Guest Vocalist',
    });
    expect(artistLinks.length).toBeGreaterThan(0);
    for (const link of artistLinks) {
      expect(link).toHaveAttribute('href', '/guestvocalist');
      expect(link).toHaveAttribute('data-entity-kind', 'artist');
    }
  });

  it('builds collaborator prose directly from exact release-credit edges', () => {
    const creditRows = [
      {
        artistId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
        name: 'Austin Leeds',
        releaseId: '353a7c04-b5bb-486e-996d-d23caced7f93',
        releaseTitle: 'Take Me Over (Austin Leeds Remix)',
        releaseSlug: 'take-me-over-austin-leeds-remix',
      },
      {
        artistId: '3cefe948-7521-465f-813a-95ae15e3141e',
        name: 'Vigel',
        releaseId: 'b01379fe-be8f-498e-86b5-888509c2f907',
        releaseTitle: 'Seaside Heights',
        releaseSlug: 'seaside-heights-3',
      },
      {
        artistId: '137bafa6-46b7-4c5c-a08c-654875a694bf',
        name: 'Lynx',
        releaseId: '7f2f25b8-bad3-4096-a754-288645b8ab67',
        releaseTitle: 'Wheels Up',
        releaseSlug: 'wheels-up',
      },
      {
        artistId: '3836027a-8351-4c0b-8922-c3259387bbf8',
        name: 'Bowles',
        releaseId: '86360da0-e045-44a0-9fee-45041b09e7b0',
        releaseTitle: 'The Sound',
        releaseSlug: 'the-sound',
      },
    ].map((credit, position) => ({
      ...credit,
      artistName: credit.name,
      artistSpotifyId: `spotify-collaborator-${position}`,
      artistProfileId: `profile-collaborator-${position}`,
      profileIsPublic: true,
      profileIsClaimed: false,
      creditName: null,
      role: 'main_artist' as const,
      releaseDate: new Date(`2026-0${position + 1}-01T00:00:00.000Z`),
      position,
    }));
    const credits = projectStructuredReleaseCollaborators({
      creatorProfileId: 'owner-profile',
      ownerSpotifyId: 'spotify-owner',
      rows: creditRows,
      limit: 4,
    });

    const content = buildProfileAeoContent({
      artist: baseArtist,
      releaseCollaborators: credits,
      now,
    });
    const paragraph = content.description.at(-1);

    expect(paragraph).toBe(
      'Collaborators credited include Austin Leeds on "Take Me Over (Austin Leeds Remix)", Vigel on "Seaside Heights", Lynx on "Wheels Up", and Bowles on "The Sound".'
    );
    expect(paragraph).not.toContain(
      'Lynx on "Take Me Over (Austin Leeds Remix)"'
    );
    expect(paragraph).not.toContain('Bowles on "Seaside Heights"');

    const segments = content.descriptionSegments.at(-1) ?? [];
    for (const credit of credits) {
      expect(segments).toContainEqual({
        type: 'artist',
        text: credit.name,
        href: credit.href,
      });
      expect(segments).toContainEqual({
        type: 'release',
        text: credit.releaseTitle,
        href: `/dj-test/${credit.releaseSlug}`,
      });
    }
  });

  it('keeps same-name collaborators distinct by stable artist ID', () => {
    const content = buildProfileAeoContent({
      artist: baseArtist,
      releaseCollaborators: [
        {
          artistId: '57d7fa47-5df1-40d9-b32c-c6e0e76ae024',
          name: 'Alex Lee',
          href: '/artists/57d7fa47-5df1-40d9-b32c-c6e0e76ae024',
          profileState: 'claimed',
          role: 'featured_artist',
          releaseId: 'release-alex-one',
          releaseTitle: 'Northbound',
          releaseSlug: 'northbound',
          releaseDate: now,
          position: 1,
        },
        {
          artistId: 'e061a679-466c-465a-a545-64a7e39aa3c6',
          name: 'Alex Lee',
          href: '/artists/e061a679-466c-465a-a545-64a7e39aa3c6',
          profileState: 'unclaimed',
          role: 'main_artist',
          releaseId: 'release-alex-two',
          releaseTitle: 'Southbound',
          releaseSlug: 'southbound',
          releaseDate: now,
          position: 0,
        },
      ],
      now,
    });

    const artistSegments = (content.descriptionSegments.at(-1) ?? []).filter(
      segment => segment.type === 'artist'
    );
    expect(artistSegments).toEqual([
      {
        type: 'artist',
        text: 'Alex Lee',
        href: '/artists/57d7fa47-5df1-40d9-b32c-c6e0e76ae024',
      },
      {
        type: 'artist',
        text: 'Alex Lee',
        href: '/artists/e061a679-466c-465a-a545-64a7e39aa3c6',
      },
    ]);
  });

  it('renders unavailable or private collaborator identities as plain text', () => {
    const content = buildProfileAeoContent({
      artist: baseArtist,
      releaseCollaborators: [
        {
          artistId: 'f5441adb-6789-449a-9553-ab7460c9c61c',
          name: 'Private Artist',
          href: null,
          profileState: 'unavailable',
          role: 'featured_artist',
          releaseId: '353a7c04-b5bb-486e-996d-d23caced7f93',
          releaseTitle: 'Quiet Signal',
          releaseSlug: 'quiet-signal',
          releaseDate: now,
          position: 1,
        },
      ],
      now,
    });

    render(<ProfileAeoContent content={content} />);
    expect(screen.getByTestId('profile-aeo-content')).toHaveTextContent(
      'Private Artist'
    );
    expect(screen.queryByRole('link', { name: 'Private Artist' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Quiet Signal' })).toHaveAttribute(
      'href',
      '/dj-test/quiet-signal'
    );
  });

  it('defaults to plain-text segments when no entity context is provided', () => {
    const content = buildProfileAeoContent({ artist: baseArtist, now });

    expect(content.descriptionSegments).toHaveLength(
      content.description.length
    );
    for (const [index, segments] of content.descriptionSegments.entries()) {
      expect(segments).toEqual([
        { type: 'text', text: content.description[index] },
      ]);
    }
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
    expect(screen.getByText('Free · Claim with Spotify')).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: 'Claim the DJ Test profile and sign up for Jovie',
      })
    ).toHaveAttribute('href', '/dj-test/claim?next=auth');

    rerender(<ProfileAeoContent content={content} />);
    expect(screen.queryByTestId('profile-aeo-claim-card')).toBeNull();
  });
});
