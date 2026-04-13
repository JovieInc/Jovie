import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import {
  HOME_RELEASE_DESTINATION_LIVE_MOCK,
  HOME_RELEASE_DESTINATION_PRESAVE_MOCK,
} from '@/features/home/home-surface-seed';
import type {
  ProfileShowcaseState,
  ProfileShowcaseStateId,
} from '@/features/profile/contracts';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import type { PublicContact } from '@/types/contacts';
import type { Artist, LegacySocialLink } from '@/types/db';

const CREATED_AT = '2026-01-10T00:00:00.000Z';

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
  {
    id: 'homepage-contact-booking',
    role: 'bookings',
    roleLabel: 'Booking',
    territorySummary: 'Worldwide',
    territoryCount: 1,
    secondaryLabel: 'North America + Europe',
    primaryContactLabel: 'Lina Park',
    channels: [
      {
        type: 'email',
        encoded: 'mailto:booking@timwhite.com',
        preferred: true,
      },
    ],
  },
  {
    id: 'homepage-contact-management',
    role: 'management',
    roleLabel: 'Management',
    territorySummary: 'Global',
    territoryCount: 1,
    secondaryLabel: 'Day-to-day management',
    primaryContactLabel: 'Mason Clarke',
    channels: [
      {
        type: 'email',
        encoded: 'mailto:management@timwhite.com',
        preferred: true,
      },
    ],
  },
  {
    id: 'homepage-contact-press',
    role: 'press_pr',
    roleLabel: 'Press',
    territorySummary: 'US/UK',
    territoryCount: 2,
    secondaryLabel: 'Press and publicity',
    primaryContactLabel: 'Avery Quinn',
    channels: [
      {
        type: 'email',
        encoded: 'mailto:press@timwhite.com',
        preferred: true,
      },
    ],
  },
  {
    id: 'homepage-contact-brand',
    role: 'brand_partnerships',
    roleLabel: 'Brand Partnerships',
    territorySummary: 'Global',
    territoryCount: 1,
    secondaryLabel: 'Campaigns and partnerships',
    primaryContactLabel: 'Jovie Partnerships',
    channels: [
      {
        type: 'email',
        encoded: 'mailto:brands@timwhite.com',
        preferred: true,
      },
    ],
  },
] as const;

export const HOMEPAGE_PROFILE_PREVIEW_TOUR_DATES: readonly TourDateViewModel[] =
  [
    {
      id: 'homepage-tour-1',
      profileId: HOMEPAGE_PROFILE_PREVIEW_ARTIST.id,
      externalId: 'tour-1',
      provider: 'manual',
      title: 'Afterglow Tour',
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
      title: 'Afterglow Tour',
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
  },
  live: {
    title: HOME_RELEASE_DESTINATION_LIVE_MOCK.title,
    slug: 'take-me-over',
    artworkUrl: '/img/releases/take-me-over.jpg',
    releaseDate: '2024-10-01T07:00:00.000Z',
    releaseType: 'single',
  },
} as const;

export const HOMEPAGE_PROFILE_SHOWCASE_STATES: Readonly<
  Record<ProfileShowcaseStateId, ProfileShowcaseState>
> = {
  default: {
    id: 'default',
    drawerView: null,
    latestReleaseKey: 'live',
    notifications: {
      tone: 'quiet',
      label: 'Join 1.2K subscribers',
      helper: 'Get notified when the next release lands.',
      actionLabel: 'Join fans',
    },
    showSubscriptionConfirmedBanner: false,
  },
  presave: {
    id: 'presave',
    drawerView: null,
    latestReleaseKey: 'presave',
    notifications: {
      tone: 'quiet',
      label: 'Presave is open',
      helper: 'Fans can opt in before release day.',
      actionLabel: 'Presave now',
    },
    showSubscriptionConfirmedBanner: false,
  },
  listen: {
    id: 'listen',
    drawerView: 'listen',
    latestReleaseKey: 'live',
    notifications: {
      tone: 'quiet',
      label: 'Now streaming everywhere',
      helper: 'Fans land on the best place to listen.',
      actionLabel: 'Listen now',
    },
    showSubscriptionConfirmedBanner: false,
  },
  subscribe: {
    id: 'subscribe',
    drawerView: 'subscribe',
    latestReleaseKey: 'live',
    notifications: {
      tone: 'success',
      label: 'Email notifications on',
      helper: 'Fans opt in once and come back automatically.',
      value: 'fan@example.com',
      actionLabel: 'All set',
    },
    showSubscriptionConfirmedBanner: true,
  },
  tour: {
    id: 'tour',
    drawerView: 'tour',
    latestReleaseKey: 'none',
    notifications: {
      tone: 'quiet',
      label: 'See the next date first',
      helper: 'The full tour opens in one pull.',
      actionLabel: 'See dates',
    },
    showSubscriptionConfirmedBanner: false,
  },
  tip: {
    id: 'tip',
    drawerView: 'tip',
    latestReleaseKey: 'none',
    notifications: {
      tone: 'quiet',
      label: 'Support without leaving the profile',
      helper: 'A quick tip can become a lasting fan connection.',
      actionLabel: 'Send support',
    },
    showSubscriptionConfirmedBanner: false,
  },
  contact: {
    id: 'contact',
    drawerView: 'contact',
    latestReleaseKey: 'none',
    notifications: {
      tone: 'quiet',
      label: 'Business routes stay clear',
      helper: 'Booking, management, and press stay one tap away.',
      actionLabel: 'Open contacts',
    },
    showSubscriptionConfirmedBanner: false,
  },
  catalog: {
    id: 'catalog',
    drawerView: null,
    latestReleaseKey: 'live',
    notifications: {
      tone: 'quiet',
      label: 'Music, shows, support, contact',
      helper: 'Between drops, the profile still works.',
      actionLabel: 'Stay current',
    },
    showSubscriptionConfirmedBanner: false,
  },
} as const;
