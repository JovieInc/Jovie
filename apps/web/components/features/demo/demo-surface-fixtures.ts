import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import type { EarningsResponse } from '@/lib/queries/useEarningsQuery';
import type { DashboardAnalyticsResponse } from '@/types/analytics';
import type { InsightResponse } from '@/types/insights';
import { DEMO_AUDIENCE_MEMBERS } from './mock-release-data';

export const DEMO_STATIC_AUDIENCE_ANALYTICS: DashboardAnalyticsResponse = {
  profile_views: 12_847,
  unique_users: 9_635,
  subscribers: 5_312,
  identified_users: 2_156,
  capture_rate: 41.3,
  total_clicks: 8_934,
  listen_clicks: 3_421,
  tip_link_visits: 624,
  top_cities: [
    { city: 'Los Angeles', count: 1_823 },
    { city: 'New York', count: 1_456 },
    { city: 'London', count: 987 },
    { city: 'Toronto', count: 743 },
    { city: 'Berlin', count: 612 },
  ],
  top_countries: [
    { country: 'United States', count: 5_814 },
    { country: 'United Kingdom', count: 1_704 },
    { country: 'Canada', count: 943 },
    { country: 'Germany', count: 731 },
    { country: 'Australia', count: 418 },
  ],
  top_referrers: [
    { referrer: 'Instagram', count: 4_521 },
    { referrer: 'Direct', count: 2_134 },
    { referrer: 'Twitter/X', count: 1_876 },
    { referrer: 'TikTok', count: 1_203 },
    { referrer: 'Spotify', count: 891 },
  ],
  top_links: [
    { id: 'spotify', url: 'Spotify', clicks: 3_245 },
    { id: 'apple-music', url: 'Apple Music', clicks: 2_187 },
    { id: 'youtube', url: 'YouTube', clicks: 1_654 },
    { id: 'soundcloud', url: 'SoundCloud', clicks: 823 },
    { id: 'bandcamp', url: 'Bandcamp', clicks: 412 },
  ],
  view: 'full',
};

export const DEMO_EARNINGS_RESPONSE: EarningsResponse = {
  stats: {
    totalRevenueCents: 23_500,
    totalTips: 47,
    averageTipCents: 500,
  },
  tippers: [
    {
      id: 'tipper-1',
      tipperName: 'Sam K.',
      contactEmail: 'sam@example.com',
      amountCents: 500,
      createdAt: '2026-04-12T18:30:00.000Z',
    },
    {
      id: 'tipper-2',
      tipperName: 'Anonymous',
      contactEmail: null,
      amountCents: 1000,
      createdAt: '2026-04-11T20:15:00.000Z',
    },
    {
      id: 'tipper-3',
      tipperName: 'Jordan B.',
      contactEmail: 'jordan@example.com',
      amountCents: 300,
      createdAt: '2026-04-10T12:00:00.000Z',
    },
  ],
};

export const DEMO_INSIGHTS: InsightResponse[] = [
  {
    id: 'demo-insight-city-growth',
    insightType: 'city_growth',
    category: 'geographic',
    priority: 'high',
    title: 'Toronto is heating up',
    description:
      'Audience activity in Toronto is up 38% over the last 30 days, outpacing every other top market.',
    actionSuggestion:
      'Prioritize Toronto in your next run of paid traffic and shortlist it for tour routing.',
    confidence: '0.91',
    status: 'active',
    periodStart: '2026-03-16T00:00:00.000Z',
    periodEnd: '2026-04-15T23:59:59.000Z',
    createdAt: '2026-04-15T09:00:00.000Z',
    expiresAt: '2026-05-15T09:00:00.000Z',
  },
  {
    id: 'demo-insight-referrer-surge',
    insightType: 'referrer_surge',
    category: 'platform',
    priority: 'medium',
    title: 'Instagram is carrying discovery',
    description:
      'Instagram now drives 29% more visits than TikTok and continues to widen the gap week over week.',
    actionSuggestion:
      'Double down on Reels and story swipe-ups around release week while momentum is compounding.',
    confidence: '0.86',
    status: 'active',
    periodStart: '2026-03-16T00:00:00.000Z',
    periodEnd: '2026-04-15T23:59:59.000Z',
    createdAt: '2026-04-15T09:05:00.000Z',
    expiresAt: '2026-05-15T09:05:00.000Z',
  },
  {
    id: 'demo-insight-capture-rate',
    insightType: 'capture_rate_change',
    category: 'engagement',
    priority: 'low',
    title: 'Capture rate is holding above 40%',
    description:
      'Subscriber capture stayed above 40% for the second straight month, suggesting the current profile funnel is resonating.',
    actionSuggestion:
      'Keep the current CTA stack intact and test traffic expansion before redesigning the profile.',
    confidence: '0.78',
    status: 'active',
    periodStart: '2026-03-16T00:00:00.000Z',
    periodEnd: '2026-04-15T23:59:59.000Z',
    createdAt: '2026-04-15T09:10:00.000Z',
    expiresAt: '2026-05-15T09:10:00.000Z',
  },
];

export const DEMO_HANDLE_VALIDATION = {
  available: true,
  checking: false,
  error: null,
  clientValid: true,
  suggestions: ['calvindemo', 'calvinharrisdemo'],
};

export const DEMO_ENRICHED_PROFILE: EnrichedProfileData = {
  name: INTERNAL_DJ_DEMO_PERSONA.profile.displayName,
  imageUrl: INTERNAL_DJ_DEMO_PERSONA.profile.avatarSrc,
  bio: INTERNAL_DJ_DEMO_PERSONA.profile.bio,
  genres: [...INTERNAL_DJ_DEMO_PERSONA.profile.genres],
  followers: INTERNAL_DJ_DEMO_PERSONA.profile.spotifyFollowers ?? 184_000,
};

export const DEMO_PROFILE_SOCIAL_LINKS: ProfileSocialLink[] =
  INTERNAL_DJ_DEMO_PERSONA.socialLinks.map((link, index) => ({
    id: `demo-social-link-${index + 1}`,
    platform: link.platform,
    platformType: link.platformType,
    url: link.url,
    sortOrder: link.sortOrder,
    isActive: true,
    displayText: link.displayText,
    state: 'active',
    confidence: 1,
    sourcePlatform: null,
    sourceType: 'manual',
    evidence: null,
    verificationStatus: 'verified',
    verificationToken: null,
    verifiedAt: '2026-04-15T12:00:00.000Z',
    version: 1,
  }));

export const DEMO_SOURCE_LINK_URL = 'https://jov.ie/source/demo-profile';

export const DEMO_AUDIENCE_ROWS = DEMO_AUDIENCE_MEMBERS;
