/**
 * Mock DashboardData for the demo page.
 *
 * Provides a fully-populated DashboardData object that satisfies
 * all context consumers (UnifiedSidebar, DashboardHeader, DashboardNav, etc.)
 * without requiring authentication or database access.
 */

import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import type { CreatorProfile } from '@/lib/db/schema/profiles';

const now = new Date();

/**
 * Mock CreatorProfile matching the "Sora Vale" demo persona.
 * Only the fields actually read by shell components are populated;
 * the rest use schema defaults (null / false / 0).
 */
const DEMO_PROFILE: CreatorProfile = {
  id: 'demo-profile',
  userId: 'demo-user-001',
  waitlistEntryId: null,
  creatorType: 'artist',
  username: 'soravale',
  usernameNormalized: 'soravale',
  displayName: 'Sora Vale',
  bio: 'Indie electronic artist blending synthwave and ambient textures.',
  venmoHandle: null,
  avatarUrl: null,
  spotifyUrl: 'https://open.spotify.com/artist/demo',
  appleMusicUrl: null,
  youtubeUrl: null,
  spotifyId: null,
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
  isFeatured: false,
  marketingOptOut: false,
  isClaimed: true,
  claimToken: null,
  claimedAt: now,
  claimTokenExpiresAt: null,
  claimedFromIp: null,
  claimedUserAgent: null,
  avatarLockedByUser: false,
  displayNameLocked: false,
  ingestionStatus: 'idle',
  lastIngestionError: null,
  lastLoginAt: now,
  profileViews: 1_234,
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
  genres: ['Indie Electronic', 'Synthwave', 'Ambient'],
  location: 'Los Angeles, CA',
  activeSinceYear: 2022,
  spotifyFollowers: 8_450,
  spotifyPopularity: 58,
  ingestionSourcePlatform: null,
  outreachStatus: 'pending',
  outreachChannel: null,
  dmSentAt: null,
  dmCopy: null,
  outreachPriority: null,
  stripeAccountId: null,
  stripeOnboardingComplete: false,
  stripePayoutsEnabled: false,
  createdAt: now,
  updatedAt: now,
};

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
