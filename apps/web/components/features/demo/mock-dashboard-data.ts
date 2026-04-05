/**
 * Mock DashboardData for the demo page.
 *
 * Provides a fully-populated DashboardData object that satisfies
 * all context consumers (UnifiedSidebar, DashboardHeader, DashboardNav, etc.)
 * without requiring authentication or database access.
 */

import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import type { CreatorProfile } from '@/lib/db/schema/profiles';
import { TIM_WHITE_SPOTIFY_ID } from '@/lib/spotify/blacklist';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

const now = new Date();

/**
 * Default demo profile fields. Can be overridden by a FeaturedCreator
 * fetched from the DB via getDemoCreator().
 */
const DEFAULT_DEMO_PROFILE: CreatorProfile = {
  id: 'demo-profile',
  userId: 'demo-user-001',
  waitlistEntryId: null,
  creatorType: 'artist',
  username: TIM_WHITE_PROFILE.handle,
  usernameNormalized: TIM_WHITE_PROFILE.handle,
  displayName: TIM_WHITE_PROFILE.name,
  bio: 'Artist',
  careerHighlights: null,
  targetPlaylists: null,
  venmoHandle: null,
  avatarUrl: TIM_WHITE_PROFILE.avatarSrc,
  spotifyUrl: TIM_WHITE_PROFILE.spotifyUrl,
  appleMusicUrl: null,
  youtubeUrl: null,
  spotifyId: TIM_WHITE_SPOTIFY_ID,
  appleMusicId: null,
  youtubeMusicId: null,
  deezerId: null,
  tidalId: null,
  soundcloudId: null,
  musicbrainzId: null,
  bandsintownArtistName: null,
  bandsintownApiKey: null,
  isPublic: true,
  isVerified: true,
  isFeatured: true,
  marketingOptOut: false,
  isClaimed: true,
  claimToken: null,
  claimedAt: now,
  claimTokenExpiresAt: null,
  claimedFromIp: null,
  claimedUserAgent: null,
  avatarLockedByUser: false,
  displayNameLocked: false,
  usernameLockedAt: null,
  ingestionStatus: 'idle',
  lastIngestionError: null,
  profileViews: 2_847,
  onboardingCompletedAt: now,
  settings: {},
  theme: {},
  notificationPreferences: {
    releasePreview: true,
    releaseDay: true,
    dspMatchSuggested: true,
    socialLinkSuggested: true,
    enrichmentComplete: false,
    newReleaseDetected: true,
  },
  fitScore: null,
  fitScoreBreakdown: null,
  fitScoreUpdatedAt: null,
  genres: ['Electronic', 'Dance'],
  location: 'Los Angeles, CA',
  activeSinceYear: 2021,
  spotifyFollowers: 12_450,
  spotifyPopularity: 62,
  ingestionSourcePlatform: null,
  outreachStatus: 'pending',
  outreachChannel: null,
  dmSentAt: null,
  dmCopy: null,
  stripeAccountId: null,
  stripeOnboardingComplete: false,
  stripePayoutsEnabled: false,
  nextTaskNumber: 1,
  smsAccessRequestedAt: null,
  discoveredPixels: null,
  discoveredPixelsAt: null,
  createdAt: now,
  updatedAt: now,
};

/**
 * Build a CreatorProfile from a FeaturedCreator (DB-driven).
 * Falls back to DEFAULT_DEMO_PROFILE for any missing fields.
 */
export function buildDemoProfile(creator?: {
  id?: string;
  handle: string;
  name: string;
  src: string;
  tagline?: string | null;
  genres?: string[];
}): CreatorProfile {
  if (!creator) return DEFAULT_DEMO_PROFILE;

  return {
    ...DEFAULT_DEMO_PROFILE,
    id: creator.id ?? DEFAULT_DEMO_PROFILE.id,
    username: creator.handle,
    usernameNormalized: creator.handle.toLowerCase(),
    displayName: creator.name,
    bio: creator.tagline ?? DEFAULT_DEMO_PROFILE.bio,
    avatarUrl: creator.src,
    genres: creator.genres ?? DEFAULT_DEMO_PROFILE.genres,
  };
}

const DEMO_PROFILE = DEFAULT_DEMO_PROFILE;

/** Default dashboard data using Tim White. */
export const DEMO_DASHBOARD_DATA: DashboardData = {
  user: { id: 'demo-user-001' },
  creatorProfiles: [DEMO_PROFILE],
  selectedProfile: DEMO_PROFILE,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: true,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 12,
    totalReceivedCents: 15_600,
    monthReceivedCents: 2_500,
  },
  profileCompletion: {
    percentage: 100,
    completedCount: 4,
    totalCount: 4,
    steps: [],
    profileIsLive: true,
  },
};

/**
 * Build DashboardData from a DB-fetched FeaturedCreator.
 * Used by the demo page to render the real shell with a dynamic creator.
 */
export function buildDemoDashboardData(
  creator?: Parameters<typeof buildDemoProfile>[0]
): DashboardData {
  const profile = buildDemoProfile(creator);
  return {
    ...DEMO_DASHBOARD_DATA,
    creatorProfiles: [profile],
    selectedProfile: profile,
  };
}
