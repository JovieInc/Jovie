import {
  HOME_RELEASE_DESTINATION_LIVE_MOCK,
  HOME_RELEASE_DESTINATION_PRESAVE_MOCK,
} from '@/features/home/home-surface-seed';
import type {
  ProfilePrimaryTab,
  ProfileShowcaseState,
  ProfileShowcaseStateId,
} from '@/features/profile/contracts';
import type { PublicRelease } from '@/features/profile/releases/types';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

const CREATED_AT = '2026-01-10T00:00:00.000Z';
const MOCK_HOME_HERO_IMAGE_URL =
  '/images/mock-profile/tim-white-dont-look-down-hero.jpg';
const MOCK_HOME_CARD_IMAGE_URL =
  '/images/mock-profile/tim-white-dont-look-down-card.jpg';

type HomepageContactInput = {
  readonly id: string;
  readonly role: PublicContact['role'];
  readonly roleLabel: string;
  readonly territorySummary: string;
  readonly territoryCount: number;
  readonly territories: readonly string[];
  readonly companyLabel: string;
  readonly contactName: string;
  readonly emailAddress: string;
};

const createHomepageContact = ({
  id,
  role,
  roleLabel,
  territorySummary,
  territoryCount,
  territories,
  companyLabel,
  contactName,
  emailAddress,
}: HomepageContactInput): PublicContact => ({
  id,
  role,
  roleLabel,
  territorySummary,
  territoryCount,
  territories: [...territories],
  companyLabel,
  contactName,
  secondaryLabel: companyLabel,
  primaryContactLabel: contactName,
  channels: [
    {
      type: 'email',
      encoded: `mailto:${emailAddress}`,
      preferred: true,
    },
  ],
});

type HomepageShowcaseStateInput = {
  readonly id: ProfileShowcaseStateId;
  readonly latestReleaseKey: ProfileShowcaseState['latestReleaseKey'];
  readonly kind: ProfileShowcaseState['notifications']['kind'];
  readonly tone: ProfileShowcaseState['notifications']['tone'];
  readonly label: ProfileShowcaseState['notifications']['label'];
  readonly helper: ProfileShowcaseState['notifications']['helper'];
  readonly value?: ProfileShowcaseState['notifications']['value'];
  readonly releaseActionLabel?: ProfileShowcaseState['releaseActionLabel'];
  readonly drawerView?: ProfileShowcaseState['drawerView'];
  readonly previewOverlay?: ProfileShowcaseState['previewOverlay'];
  readonly showSubscriptionConfirmedBanner: boolean;
};

const createShowcaseState = ({
  id,
  latestReleaseKey,
  kind,
  tone,
  label,
  helper,
  value,
  releaseActionLabel,
  drawerView = null,
  previewOverlay = null,
  showSubscriptionConfirmedBanner,
}: HomepageShowcaseStateInput): ProfileShowcaseState => ({
  id,
  drawerView,
  latestReleaseKey,
  ...(releaseActionLabel ? { releaseActionLabel } : {}),
  notifications: {
    kind,
    tone,
    label,
    helper,
    ...(value ? { value } : {}),
  },
  showSubscriptionConfirmedBanner,
  previewOverlay,
});

type HomepageShowcaseCoreInput = Omit<
  HomepageShowcaseStateInput,
  'kind' | 'tone' | 'showSubscriptionConfirmedBanner'
>;

type HomepageShowcaseComposeInput = Omit<
  HomepageShowcaseStateInput,
  'tone' | 'showSubscriptionConfirmedBanner'
>;

const createQuietButtonShowcaseState = (
  input: HomepageShowcaseCoreInput
): ProfileShowcaseState =>
  createShowcaseState({
    ...input,
    kind: 'button',
    tone: 'quiet',
    showSubscriptionConfirmedBanner: false,
  });

const createSuccessButtonShowcaseState = (
  input: HomepageShowcaseCoreInput
): ProfileShowcaseState =>
  createShowcaseState({
    ...input,
    kind: 'button',
    tone: 'success',
    showSubscriptionConfirmedBanner: false,
  });

const createComposeShowcaseState = (
  input: HomepageShowcaseComposeInput
): ProfileShowcaseState =>
  createShowcaseState({
    ...input,
    tone: 'compose',
    showSubscriptionConfirmedBanner: false,
  });

const createSuccessStatusShowcaseState = (
  input: HomepageShowcaseCoreInput
): ProfileShowcaseState =>
  createShowcaseState({
    ...input,
    kind: 'status',
    tone: 'success',
    showSubscriptionConfirmedBanner: true,
  });

export const HOMEPAGE_PROFILE_PREVIEW_ARTIST: Artist = {
  id: 'homepage-preview-artist',
  owner_user_id: 'homepage-preview-owner',
  handle: TIM_WHITE_PROFILE.handle,
  spotify_id: TIM_WHITE_PROFILE.spotifyArtistId,
  name: TIM_WHITE_PROFILE.name,
  image_url: TIM_WHITE_PROFILE.avatarSrc,
  tagline: 'Producer, songwriter, and after-hours romantic.',
  settings: {},
  theme: {
    profileAccent: {
      version: 1,
      primaryHex: '#d3834e',
      sourceUrl: TIM_WHITE_PROFILE.avatarSrc,
    },
  },
  spotify_url: TIM_WHITE_PROFILE.spotifyUrl,
  apple_music_url: 'https://music.apple.com/us/artist/tim-white/123456789',
  youtube_url: 'https://www.youtube.com/@timwhite',
  deezer_id: 'tim-white-deezer',
  tidal_id: 'tim-white-tidal',
  soundcloud_id: 'tim-white-soundcloud',
  venmo_handle: '@timwhite',
  location: 'Los Angeles, CA',
  hometown: 'Vancouver, BC',
  active_since_year: 2014,
  genres: ['Melodic House', 'Progressive', 'Electronic'],
  career_highlights:
    'Support from Cosmic Gate, SiriusXM, and A State of Trance.',
  target_playlists: ['Mint', 'Dance Rising'],
  published: true,
  is_verified: true,
  is_featured: true,
  marketing_opt_out: false,
  created_at: CREATED_AT,
};

export const HOMEPAGE_PROFILE_PREVIEW_MOCK_HOME_ARTIST: Artist = {
  ...HOMEPAGE_PROFILE_PREVIEW_ARTIST,
  id: 'homepage-preview-artist-mock-home',
  image_url: MOCK_HOME_HERO_IMAGE_URL,
  tagline: "Don't Look Down",
  settings: {
    ...(HOMEPAGE_PROFILE_PREVIEW_ARTIST.settings ?? {}),
    heroRoleLabel: 'DJ / Producer',
  },
  theme: {
    profileAccent: {
      version: 1,
      primaryHex: '#ed9962',
      sourceUrl: MOCK_HOME_HERO_IMAGE_URL,
    },
  },
};

export const HOMEPAGE_PROFILE_PREVIEW_SOCIAL_LINKS: readonly LegacySocialLink[] =
  [
    {
      id: 'homepage-preview-spotify',
      artist_id: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      platform: 'spotify',
      url: HOMEPAGE_PROFILE_PREVIEW_ARTIST.spotify_url ?? 'https://spotify.com',
      clicks: 1820,
      created_at: CREATED_AT,
      is_visible: true,
    },
    {
      id: 'homepage-preview-instagram',
      artist_id: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      platform: 'instagram',
      url: 'https://instagram.com/timwhitemusic',
      clicks: 910,
      created_at: CREATED_AT,
      is_visible: true,
    },
    {
      id: 'homepage-preview-youtube',
      artist_id: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      platform: 'youtube',
      url: 'https://www.youtube.com/@timwhite',
      clicks: 522,
      created_at: CREATED_AT,
      is_visible: true,
    },
    {
      id: 'homepage-preview-venmo',
      artist_id: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      platform: 'venmo',
      url: 'https://venmo.com/u/timwhite',
      clicks: 302,
      created_at: CREATED_AT,
      is_visible: true,
    },
  ] as const;

export const HOMEPAGE_PROFILE_PREVIEW_MOCK_HOME_SOCIAL_LINKS: readonly LegacySocialLink[] =
  [
    {
      id: 'homepage-preview-mock-instagram',
      artist_id: HOMEPAGE_PROFILE_PREVIEW_MOCK_HOME_ARTIST.id,
      platform: 'instagram',
      url: 'https://instagram.com/timwhitemusic',
      clicks: 910,
      created_at: CREATED_AT,
      is_visible: true,
    },
    {
      id: 'homepage-preview-mock-spotify',
      artist_id: HOMEPAGE_PROFILE_PREVIEW_MOCK_HOME_ARTIST.id,
      platform: 'spotify',
      url:
        HOMEPAGE_PROFILE_PREVIEW_MOCK_HOME_ARTIST.spotify_url ??
        'https://open.spotify.com/artist/4u',
      clicks: 1820,
      created_at: CREATED_AT,
      is_visible: true,
    },
  ] as const;

export const HOMEPAGE_PROFILE_PREVIEW_CONTACTS: readonly PublicContact[] = [
  createHomepageContact({
    id: 'homepage-contact-booking',
    role: 'bookings',
    roleLabel: 'Booking',
    territorySummary: 'North America +1',
    territoryCount: 2,
    territories: ['North America', 'Europe'],
    companyLabel: 'Nightshift Touring',
    contactName: 'Lina Park',
    emailAddress: 'booking@timwhite.com',
  }),
  createHomepageContact({
    id: 'homepage-contact-management',
    role: 'management',
    roleLabel: 'Management',
    territorySummary: 'Worldwide',
    territoryCount: 1,
    territories: ['Worldwide'],
    companyLabel: 'Northstar Management',
    contactName: 'Mason Clarke',
    emailAddress: 'management@timwhite.com',
  }),
  createHomepageContact({
    id: 'homepage-contact-press',
    role: 'press_pr',
    roleLabel: 'Press',
    territorySummary: 'United States +1',
    territoryCount: 2,
    territories: ['United States', 'United Kingdom'],
    companyLabel: 'Daylight PR',
    contactName: 'Avery Quinn',
    emailAddress: 'press@timwhite.com',
  }),
  createHomepageContact({
    id: 'homepage-contact-brand',
    role: 'brand_partnerships',
    roleLabel: 'Brand Partnerships',
    territorySummary: 'Worldwide',
    territoryCount: 1,
    territories: ['Worldwide'],
    companyLabel: 'Jovie Partnerships',
    contactName: 'Aria Bennett',
    emailAddress: 'brands@timwhite.com',
  }),
];

export const HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES: readonly TourDateViewModel[] =
  [
    {
      id: 'homepage-tour-1',
      profileId: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      externalId: 'tour-1',
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: CREATED_AT,
      title: 'The Deep End Tour',
      startDate: '2026-05-18T03:00:00.000Z',
      startTime: '20:00',
      timezone: 'America/Los_Angeles',
      venueName: 'The Novo',
      city: 'Los Angeles',
      region: 'CA',
      country: 'US',
      latitude: 34.043,
      longitude: -118.267,
      ticketUrl: 'https://tickets.example.com/the-novo',
      ticketStatus: 'available',
      lastSyncedAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: 'homepage-tour-2',
      profileId: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      externalId: 'tour-2',
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: CREATED_AT,
      title: 'The Deep End Tour',
      startDate: '2026-05-24T03:00:00.000Z',
      startTime: '21:00',
      timezone: 'America/Chicago',
      venueName: 'Radius',
      city: 'Chicago',
      region: 'IL',
      country: 'US',
      latitude: 41.852,
      longitude: -87.619,
      ticketUrl: 'https://tickets.example.com/radius',
      ticketStatus: 'available',
      lastSyncedAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: 'homepage-tour-3',
      profileId: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      externalId: 'tour-3',
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: CREATED_AT,
      title: 'The Deep End Tour',
      startDate: '2026-06-07T03:00:00.000Z',
      startTime: '20:00',
      timezone: 'America/New_York',
      venueName: 'Brooklyn Steel',
      city: 'Brooklyn',
      region: 'NY',
      country: 'US',
      latitude: 40.7226,
      longitude: -73.9389,
      ticketUrl: 'https://tickets.example.com/brooklyn-steel',
      ticketStatus: 'available',
      lastSyncedAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: 'homepage-tour-4',
      profileId: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      externalId: 'tour-4',
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: CREATED_AT,
      title: 'The Deep End Tour',
      startDate: '2026-06-14T03:00:00.000Z',
      startTime: '20:00',
      timezone: 'America/Toronto',
      venueName: 'The Danforth',
      city: 'Toronto',
      region: 'ON',
      country: 'CA',
      latitude: 43.6769,
      longitude: -79.3573,
      ticketUrl: 'https://tickets.example.com/the-danforth',
      ticketStatus: 'available',
      lastSyncedAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: 'homepage-tour-5',
      profileId: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      externalId: 'tour-5',
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: CREATED_AT,
      title: 'The Deep End Tour',
      startDate: '2026-06-21T03:00:00.000Z',
      startTime: '20:00',
      timezone: 'America/Los_Angeles',
      venueName: 'The Echo',
      city: 'Los Angeles',
      region: 'CA',
      country: 'US',
      latitude: 34.0777,
      longitude: -118.2606,
      ticketUrl: 'https://tickets.example.com/the-echo',
      ticketStatus: 'available',
      lastSyncedAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: 'homepage-tour-6',
      profileId: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      externalId: 'tour-6',
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: CREATED_AT,
      title: 'The Deep End Tour',
      startDate: '2026-06-28T03:00:00.000Z',
      startTime: '20:00',
      timezone: 'America/Los_Angeles',
      venueName: 'Rickshaw Stop',
      city: 'San Francisco',
      region: 'CA',
      country: 'US',
      latitude: 37.7749,
      longitude: -122.4194,
      ticketUrl: 'https://tickets.example.com/rickshaw-stop',
      ticketStatus: 'available',
      lastSyncedAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: 'homepage-tour-7',
      profileId: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      externalId: 'tour-7',
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: CREATED_AT,
      title: 'The Deep End Tour',
      startDate: '2026-07-05T03:00:00.000Z',
      startTime: '20:00',
      timezone: 'America/Los_Angeles',
      venueName: 'Holocene',
      city: 'Portland',
      region: 'OR',
      country: 'US',
      latitude: 45.5231,
      longitude: -122.6765,
      ticketUrl: 'https://tickets.example.com/holocene',
      ticketStatus: 'available',
      lastSyncedAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
    {
      id: 'homepage-tour-8',
      profileId: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      externalId: 'tour-8',
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: CREATED_AT,
      title: 'The Deep End Tour',
      startDate: '2026-07-11T03:00:00.000Z',
      startTime: '20:00',
      timezone: 'America/Los_Angeles',
      venueName: 'Barboza',
      city: 'Seattle',
      region: 'WA',
      country: 'US',
      latitude: 47.608,
      longitude: -122.335,
      ticketUrl: 'https://tickets.example.com/barboza',
      ticketStatus: 'available',
      lastSyncedAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  ] as const;

export const HOMEPAGE_PROFILE_PREVIEW_MOCK_HOME_TOUR_DATES: readonly TourDateViewModel[] =
  [
    {
      id: 'homepage-tour-mock-home-1',
      profileId: HOMEPAGE_PROFILE_PREVIEW_MOCK_HOME_ARTIST.id,
      externalId: 'tour-mock-home-1',
      provider: 'manual',
      eventType: 'tour',
      confirmationStatus: 'confirmed',
      reviewedAt: CREATED_AT,
      title: "Don't Look Down Tour",
      startDate: '2026-06-21',
      startTime: '20:00',
      timezone: 'America/Los_Angeles',
      venueName: 'The Echo',
      city: 'Los Angeles',
      region: 'CA',
      country: 'US',
      latitude: 34.0777,
      longitude: -118.2606,
      ticketUrl: 'https://tickets.example.com/the-echo',
      ticketStatus: 'available',
      lastSyncedAt: CREATED_AT,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    },
  ] as const;

export const HOMEPAGE_PROFILE_PREVIEW_RELEASES = {
  presave: {
    title: HOME_RELEASE_DESTINATION_PRESAVE_MOCK.title,
    slug: 'the-deep-end',
    artworkUrl: '/img/releases/the-deep-end.jpg',
    releaseDate: '2026-05-01T07:00:00.000Z',
    revealDate: '2026-04-18T07:00:00.000Z',
    releaseType: 'single',
    metadata: {
      artistNames: ['Tim White', 'Cosmic Gate'],
    },
  },
  live: {
    title: HOME_RELEASE_DESTINATION_LIVE_MOCK.title,
    slug: 'take-me-over',
    artworkUrl: '/img/releases/take-me-over.jpg',
    releaseDate: '2024-10-01T07:00:00.000Z',
    releaseType: 'single',
    metadata: {
      artistNames: ['Tim White', 'Cosmic Gate'],
    },
  },
} as const;

export const HOMEPAGE_PROFILE_PREVIEW_MOCK_HOME_RELEASE = {
  title: "Don't Look Down",
  slug: 'dont-look-down',
  artworkUrl: MOCK_HOME_CARD_IMAGE_URL,
  releaseDate: '2025-10-01T07:00:00.000Z',
  releaseType: 'single',
  metadata: {
    artistNames: ['Tim White'],
  },
} as const;

export const HOMEPAGE_PROFILE_PREVIEW_DRAWER_RELEASES: readonly PublicRelease[] =
  [
    {
      id: 'drawer-release-1',
      title: "Don't Look Down",
      slug: 'dont-look-down',
      releaseType: 'single',
      releaseDate: '2024-11-01T07:00:00.000Z',
      artworkUrl: '/images/mock-profile/tim-white-dont-look-down-card.jpg',
      artistNames: ['Tim White'],
    },
    {
      id: 'drawer-release-2',
      title: 'Holding On',
      slug: 'holding-on',
      releaseType: 'single',
      releaseDate: '2023-10-01T07:00:00.000Z',
      artworkUrl: '/images/mock-profile/drawer-releases/release-2.png',
      artistNames: ['Tim White'],
    },
    {
      id: 'drawer-release-3',
      title: 'Lost in The Static',
      slug: 'lost-in-the-static',
      releaseType: 'ep',
      releaseDate: '2022-08-15T07:00:00.000Z',
      artworkUrl: '/images/mock-profile/drawer-releases/release-3.png',
      artistNames: ['Tim White'],
    },
    {
      id: 'drawer-release-4',
      title: 'After Midnight',
      slug: 'after-midnight',
      releaseType: 'single',
      releaseDate: '2021-06-11T07:00:00.000Z',
      artworkUrl: '/images/mock-profile/drawer-releases/release-4.png',
      artistNames: ['Tim White'],
    },
    {
      id: 'drawer-release-5',
      title: 'The Long Way Home',
      slug: 'the-long-way-home',
      releaseType: 'ep',
      releaseDate: '2020-04-03T07:00:00.000Z',
      artworkUrl: '/images/mock-profile/drawer-releases/release-5.png',
      artistNames: ['Tim White'],
    },
    {
      id: 'drawer-release-6',
      title: 'Clear Skies',
      slug: 'clear-skies',
      releaseType: 'single',
      releaseDate: '2019-02-08T07:00:00.000Z',
      artworkUrl: '/images/mock-profile/drawer-releases/release-6.png',
      artistNames: ['Tim White'],
    },
  ] as const;

const HOMEPAGE_PROFILE_PREVIEW_ARTIST_SPOTIFY_ID =
  HOMEPAGE_PROFILE_PREVIEW_ARTIST.spotify_id;

if (!HOMEPAGE_PROFILE_PREVIEW_ARTIST_SPOTIFY_ID) {
  throw new Error(
    'HOMEPAGE_PROFILE_PREVIEW_ARTIST.spotify_id is required for Tim White playlist fixtures'
  );
}

export const HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK = {
  playlistId: 'playlist-this-is-tim-white',
  title: 'This Is Tim White',
  url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO0RjExample',
  imageUrl: '/img/releases/the-deep-end.jpg',
  artistSpotifyId: HOMEPAGE_PROFILE_PREVIEW_ARTIST_SPOTIFY_ID,
  source: 'serp_html',
  discoveredAt: '2026-01-10T00:00:00.000Z',
  searchQuery: 'site:open.spotify.com "This Is Tim White"',
  confirmedAt: '2026-01-10T00:00:00.000Z',
} as const;

export const HOMEPAGE_PROFILE_SHOWCASE_STATES: Readonly<
  Record<ProfileShowcaseStateId, ProfileShowcaseState>
> = {
  'mock-home': createQuietButtonShowcaseState({
    id: 'mock-home',
    latestReleaseKey: 'live',
    label: 'Mock Home',
    helper: 'Controlled preview state for pixel diff review.',
    releaseActionLabel: 'Listen',
  }),
  'streams-latest': createQuietButtonShowcaseState({
    id: 'streams-latest',
    latestReleaseKey: 'live',
    label: 'Latest Release Live',
    helper: 'The newest song stays one tap away.',
    releaseActionLabel: 'Listen',
  }),
  'streams-presave': createQuietButtonShowcaseState({
    id: 'streams-presave',
    latestReleaseKey: 'presave',
    label: 'Presave Is Live',
    helper: 'The same link now leads to the countdown.',
  }),
  'streams-release-day': createSuccessButtonShowcaseState({
    id: 'streams-release-day',
    latestReleaseKey: 'live',
    label: 'Release Day Live',
    helper: 'The newest release is now the thing fans see first.',
    releaseActionLabel: 'Listen',
    previewOverlay: {
      kind: 'email-preview',
      title: 'Out now: Take Me Over',
      body: 'Take Me Over is live now. Listen in one tap.',
      accentLabel: 'Release alert',
    },
  }),
  'streams-video': createQuietButtonShowcaseState({
    id: 'streams-video',
    latestReleaseKey: 'live',
    label: 'Video Live',
    helper: 'The same profile now leads with the video.',
    releaseActionLabel: 'Watch',
    previewOverlay: {
      kind: 'email-preview',
      title: 'Watch: This Is Love',
      body: 'This Is Love is live now. Watch from the same link.',
      accentLabel: 'Video alert',
    },
  }),
  'tour-nearby': createQuietButtonShowcaseState({
    id: 'tour-nearby',
    latestReleaseKey: 'none',
    label: 'Nearby Show',
    helper: 'Lead with the local date when there is no newer release.',
  }),
  'playlist-fallback': createQuietButtonShowcaseState({
    id: 'playlist-fallback',
    latestReleaseKey: 'none',
    label: 'Playlist Fallback',
    helper: 'Fall back to a real playlist when there is no release or tour.',
  }),
  'listen-fallback': createQuietButtonShowcaseState({
    id: 'listen-fallback',
    latestReleaseKey: 'none',
    label: 'Listen Fallback',
    helper: 'Keep a clean listen action live when nothing else should lead.',
  }),
  'fans-opt-in': createComposeShowcaseState({
    id: 'fans-opt-in',
    latestReleaseKey: 'live',
    kind: 'input',
    label: 'Turn On Alerts',
    helper: 'Fans choose alert types once. After that, Jovie keeps working.',
    value: 'fan@example.com',
  }),
  'fans-confirmed': createSuccessStatusShowcaseState({
    id: 'fans-confirmed',
    latestReleaseKey: 'live',
    label: 'Notifications On',
    helper: 'Every new song, video, or show reaches them automatically.',
    value: 'fan@example.com',
  }),
  'fans-song-alert': createSuccessStatusShowcaseState({
    id: 'fans-song-alert',
    latestReleaseKey: 'live',
    label: 'Notifications On',
    helper: 'New music reaches the same fans automatically.',
    releaseActionLabel: 'Listen',
    previewOverlay: {
      kind: 'email-preview',
      title: 'New music from Tim White',
      body: 'Take Me Over is live now. Listen from the same link.',
      accentLabel: 'Inbox',
    },
  }),
  'fans-show-alert': createSuccessStatusShowcaseState({
    id: 'fans-show-alert',
    latestReleaseKey: 'none',
    label: 'Notifications On',
    helper: 'Shows reach the same fans without another signup.',
    previewOverlay: {
      kind: 'email-preview',
      title: 'Playing Los Angeles this Friday',
      body: 'The next local show reaches the fans already following along.',
      accentLabel: 'Show alert',
    },
  }),
  'subscribe-email': createComposeShowcaseState({
    id: 'subscribe-email',
    latestReleaseKey: 'live',
    kind: 'input',
    label: 'Email Address',
    helper: 'One clean line from CTA to email capture.',
    value: 'fan@example.com',
  }),
  'subscribe-otp': createComposeShowcaseState({
    id: 'subscribe-otp',
    latestReleaseKey: 'live',
    kind: 'otp',
    label: 'Enter the 6-Digit Code From Your Email',
    helper: 'OTP stays in the same inline shell.',
    value: '142683',
  }),
  'subscribe-otp-error': createComposeShowcaseState({
    id: 'subscribe-otp-error',
    latestReleaseKey: 'live',
    kind: 'otp',
    label: 'Enter the 6-Digit Code From Your Email',
    helper: 'That code was invalid. Try again.',
    value: '142680',
  }),
  'subscribe-name': createComposeShowcaseState({
    id: 'subscribe-name',
    latestReleaseKey: 'live',
    kind: 'name',
    label: 'Name',
    helper: 'Name capture keeps the same footprint.',
    value: 'Ava Lopez',
  }),
  'subscribe-birthday': createComposeShowcaseState({
    id: 'subscribe-birthday',
    latestReleaseKey: 'live',
    kind: 'birthday',
    label: 'Birthday',
    helper: 'Birthday capture stays inline too.',
    value: '05/17/1994',
  }),
  'subscribe-done': createSuccessStatusShowcaseState({
    id: 'subscribe-done',
    latestReleaseKey: 'live',
    label: 'Notifications On',
    helper: 'The done state keeps the exact same footprint.',
  }),
  tour: createShowcaseState({
    id: 'tour',
    latestReleaseKey: 'none',
    kind: 'button',
    tone: 'quiet',
    label: 'Next Date Live',
    helper: 'Lead with the next date and open the full run from there.',
    drawerView: 'tour',
    showSubscriptionConfirmedBanner: false,
  }),
  'tips-open': createQuietButtonShowcaseState({
    id: 'tips-open',
    latestReleaseKey: 'none',
    label: 'Get Paid',
    helper: 'Take payment in one tap.',
    drawerView: 'pay',
  }),
  'tips-apple-pay': createQuietButtonShowcaseState({
    id: 'tips-apple-pay',
    latestReleaseKey: 'none',
    label: 'Apple Pay Ready',
    helper: 'Apple Pay keeps the moment moving.',
    drawerView: 'pay',
    previewOverlay: {
      kind: 'apple-pay',
      title: 'Apple Pay',
      body: 'Tip Tim White $10',
      accentLabel: 'Double-click to pay',
    },
  }),
  'tips-thank-you': createSuccessButtonShowcaseState({
    id: 'tips-thank-you',
    latestReleaseKey: 'live',
    label: 'Say Thanks',
    helper: 'Turn support into a listener.',
    releaseActionLabel: 'Listen',
    previewOverlay: {
      kind: 'thank-you',
      title: 'Thanks for the tip',
      body: "Here's my latest song.",
      accentLabel: 'Say thanks',
    },
  }),
  'tips-followup': createSuccessButtonShowcaseState({
    id: 'tips-followup',
    latestReleaseKey: 'live',
    label: 'Turn Support Into a Listener',
    helper: 'The same moment can turn into the next listen.',
    releaseActionLabel: 'Listen',
    previewOverlay: {
      kind: 'email-preview',
      title: 'Thanks for the tip',
      body: "Here's my latest song.",
      accentLabel: 'Follow-up',
    },
  }),
  contact: createShowcaseState({
    id: 'contact',
    latestReleaseKey: 'none',
    kind: 'button',
    tone: 'quiet',
    label: 'Never Miss a Booking',
    helper: 'If a talent buyer wants to book you, the contact is right there.',
    drawerView: 'contact',
    showSubscriptionConfirmedBanner: false,
  }),
  catalog: createShowcaseState({
    id: 'catalog',
    latestReleaseKey: 'live',
    kind: 'button',
    tone: 'quiet',
    label: 'One Profile',
    helper: 'One place for songs, videos, shows, and business.',
    releaseActionLabel: 'Listen',
    showSubscriptionConfirmedBanner: false,
  }),
};

export function getPreviewActiveMode(
  stateId: ProfileShowcaseStateId
): ProfilePrimaryTab {
  const drawerView = HOMEPAGE_PROFILE_SHOWCASE_STATES[stateId].drawerView;

  switch (drawerView) {
    case 'listen':
    case 'subscribe':
    case 'tour':
      return drawerView;
    default:
      return 'profile';
  }
}
