/**
 * Mock DashboardData for the demo page.
 *
 * Provides a fully-populated DashboardData object that satisfies
 * all context consumers (UnifiedSidebar, DashboardHeader, DashboardNav, etc.)
 * without requiring authentication or database access.
 */

import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import type { CreatorProfile } from '@/lib/db/schema/profiles';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';

const now = new Date();
const DEFAULT_PERSONA = INTERNAL_DJ_DEMO_PERSONA.profile;

/**
 * Default demo profile fields. Can be overridden by a FeaturedCreator
 * fetched from the DB via getDemoCreator().
 */
const DEFAULT_DEMO_PROFILE: CreatorProfile = {
  id: 'demo-profile',
  userId: 'demo-user-001',
  waitlistEntryId: null,
  creatorType: DEFAULT_PERSONA.creatorType,
  username: DEFAULT_PERSONA.handle,
  usernameNormalized: DEFAULT_PERSONA.handle,
  displayName: DEFAULT_PERSONA.displayName,
  bio: DEFAULT_PERSONA.bio,
  careerHighlights: null,
  targetPlaylists: null,
  venmoHandle: DEFAULT_PERSONA.venmoHandle,
  avatarUrl: DEFAULT_PERSONA.avatarSrc,
  spotifyUrl: DEFAULT_PERSONA.spotifyUrl,
  appleMusicUrl: DEFAULT_PERSONA.appleMusicUrl,
  youtubeUrl: DEFAULT_PERSONA.youtubeUrl,
  spotifyId: DEFAULT_PERSONA.spotifyArtistId,
  appleMusicId: DEFAULT_PERSONA.appleMusicArtistId,
  youtubeMusicId: DEFAULT_PERSONA.youtubeMusicArtistId,
  deezerId: DEFAULT_PERSONA.deezerArtistId,
  tidalId: DEFAULT_PERSONA.tidalArtistId,
  soundcloudId: DEFAULT_PERSONA.soundcloudArtistId,
  musicbrainzId: null,
  bandsintownArtistName: DEFAULT_PERSONA.bandsintownArtistName,
  bandsintownApiKey: null,
  isPublic: true,
  isVerified: true,
  isFeatured: DEFAULT_PERSONA.isFeaturedByDefault,
  marketingOptOut: false,
  isClaimed: DEFAULT_PERSONA.isClaimedByDefault,
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
  genres: [...DEFAULT_PERSONA.genres],
  location: DEFAULT_PERSONA.location,
  activeSinceYear: DEFAULT_PERSONA.activeSinceYear,
  spotifyFollowers: DEFAULT_PERSONA.spotifyFollowers,
  spotifyPopularity: DEFAULT_PERSONA.spotifyPopularity,
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

/** Default dashboard data using the internal Calvin Harris demo persona. */
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
