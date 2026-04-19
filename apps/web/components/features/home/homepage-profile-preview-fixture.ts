import {
  HOME_RELEASE_DESTINATION_LIVE_MOCK,
  HOME_RELEASE_DESTINATION_PRESAVE_MOCK,
} from '@/features/home/home-surface-seed';
import type {
  ProfileShowcaseState,
  ProfileShowcaseStateId,
} from '@/features/profile/contracts';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

const CREATED_AT = '2026-01-10T00:00:00.000Z';

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
  readonly kind: string;
  readonly tone: string;
  readonly label: string;
  readonly helper: string;
  readonly value?: string;
  readonly releaseActionLabel?: string;
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
}: HomepageShowcaseStateInput): ProfileShowcaseState =>
  ({
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
  }) as ProfileShowcaseState;

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
  theme: {},
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

export const HOMEPAGE_PROFILE_PREVIEW_PLAYLIST_FALLBACK = {
  playlistId: 'playlist-this-is-tim-white',
  title: 'This Is Tim White',
  url: 'https://open.spotify.com/playlist/37i9dQZF1DZ06evO0RjExample',
  imageUrl: '/img/releases/the-deep-end.jpg',
  artistSpotifyId: HOMEPAGE_PROFILE_PREVIEW_ARTIST.spotify_id ?? '4u',
  source: 'serp_html',
  discoveredAt: '2026-01-10T00:00:00.000Z',
  searchQuery: 'site:open.spotify.com \"This Is Tim White\"',
  confirmedAt: '2026-01-10T00:00:00.000Z',
} as const;

export const HOMEPAGE_PROFILE_SHOWCASE_STATES: Readonly<
  Record<ProfileShowcaseStateId, ProfileShowcaseState>
> = {
  'streams-latest': createQuietButtonShowcaseState({
    id: 'streams-latest',
    latestReleaseKey: 'live',
    label: 'Latest release live',
    helper: 'The newest song stays one tap away.',
    releaseActionLabel: 'Listen',
  }),
  'streams-presave': createQuietButtonShowcaseState({
    id: 'streams-presave',
    latestReleaseKey: 'presave',
    label: 'Presave is live',
    helper: 'The same link now leads to the countdown.',
  }),
  'streams-release-day': createSuccessButtonShowcaseState({
    id: 'streams-release-day',
    latestReleaseKey: 'live',
    label: 'Release day live',
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
    label: 'Video live',
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
    label: 'Nearby show',
    helper: 'Lead with the local date when there is no newer release.',
  }),
  'playlist-fallback': createQuietButtonShowcaseState({
    id: 'playlist-fallback',
    latestReleaseKey: 'none',
    label: 'Playlist fallback',
    helper: 'Fall back to a real playlist when there is no release or tour.',
  }),
  'listen-fallback': createQuietButtonShowcaseState({
    id: 'listen-fallback',
    latestReleaseKey: 'none',
    label: 'Listen fallback',
    helper: 'Keep a clean listen action live when nothing else should lead.',
  }),
  'fans-opt-in': createComposeShowcaseState({
    id: 'fans-opt-in',
    latestReleaseKey: 'live',
    kind: 'input',
    label: 'Turn on notifications',
    helper: 'Fans turn on notifications once. After that, Jovie keeps working.',
    value: 'fan@example.com',
  }),
  'fans-confirmed': createSuccessStatusShowcaseState({
    id: 'fans-confirmed',
    latestReleaseKey: 'live',
    label: 'Notifications on',
    helper: 'Every new song, video, or show reaches them automatically.',
    value: 'fan@example.com',
  }),
  'fans-song-alert': createSuccessStatusShowcaseState({
    id: 'fans-song-alert',
    latestReleaseKey: 'live',
    label: 'Notifications on',
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
    label: 'Notifications on',
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
    label: 'Email address',
    helper: 'One clean line from CTA to email capture.',
    value: 'fan@example.com',
  }),
  'subscribe-otp': createComposeShowcaseState({
    id: 'subscribe-otp',
    latestReleaseKey: 'live',
    kind: 'otp',
    label: 'Enter the 6-digit code from your email',
    helper: 'OTP stays in the same inline shell.',
    value: '142683',
  }),
  'subscribe-otp-error': createComposeShowcaseState({
    id: 'subscribe-otp-error',
    latestReleaseKey: 'live',
    kind: 'otp',
    label: 'Enter the 6-digit code from your email',
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
    label: 'Notifications on',
    helper: 'The done state keeps the exact same footprint.',
  }),
  tour: createShowcaseState({
    id: 'tour',
    latestReleaseKey: 'none',
    kind: 'button',
    tone: 'quiet',
    label: 'Next date live',
    helper: 'Lead with the next date and open the full run from there.',
    drawerView: 'tour',
    showSubscriptionConfirmedBanner: false,
  }),
  'tips-open': createQuietButtonShowcaseState({
    id: 'tips-open',
    latestReleaseKey: 'none',
    label: 'Get paid',
    helper: 'Take payment in one tap.',
    drawerView: 'pay',
  }),
  'tips-apple-pay': createQuietButtonShowcaseState({
    id: 'tips-apple-pay',
    latestReleaseKey: 'none',
    label: 'Apple Pay ready',
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
    label: 'Say thanks',
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
    label: 'Turn support into a listener',
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
    label: 'Never miss a booking',
    helper: 'If a talent buyer wants to book you, the contact is right there.',
    drawerView: 'contact',
    showSubscriptionConfirmedBanner: false,
  }),
  catalog: createShowcaseState({
    id: 'catalog',
    latestReleaseKey: 'live',
    kind: 'button',
    tone: 'quiet',
    label: 'One profile',
    helper: 'One place for songs, videos, shows, and business.',
    releaseActionLabel: 'Listen',
    showSubscriptionConfirmedBanner: false,
  }),
};
