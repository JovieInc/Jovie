import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import type { EnrichedProfileData } from '@/app/onboarding/actions/enrich-profile';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import type { EarningsResponse } from '@/lib/queries/useEarningsQuery';
import type { DashboardAnalyticsResponse } from '@/types/analytics';
import type { InsightResponse } from '@/types/insights';

const createCityCounts = (
  entries: ReadonlyArray<readonly [city: string, count: number]>
): DashboardAnalyticsResponse['top_cities'] =>
  entries.map(([city, count]) => ({ city, count }));

const createCountryCounts = (
  entries: ReadonlyArray<readonly [country: string, count: number]>
): DashboardAnalyticsResponse['top_countries'] =>
  entries.map(([country, count]) => ({ country, count }));

const createReferrerCounts = (
  entries: ReadonlyArray<readonly [referrer: string, count: number]>
): DashboardAnalyticsResponse['top_referrers'] =>
  entries.map(([referrer, count]) => ({ referrer, count }));

const createTopLinks = (
  entries: ReadonlyArray<readonly [id: string, url: string, clicks: number]>
): DashboardAnalyticsResponse['top_links'] =>
  entries.map(([id, url, clicks]) => ({ id, url, clicks }));

export const DEMO_STATIC_AUDIENCE_ANALYTICS: DashboardAnalyticsResponse = {
  profile_views: 12_847,
  unique_users: 9_635,
  subscribers: 5_312,
  identified_users: 2_156,
  capture_rate: 41.3,
  total_clicks: 8_934,
  listen_clicks: 3_421,
  tip_link_visits: 624,
  top_cities: createCityCounts([
    ['Los Angeles', 1_823],
    ['New York', 1_456],
    ['London', 987],
    ['Toronto', 743],
    ['Berlin', 612],
  ]),
  top_countries: createCountryCounts([
    ['United States', 5_814],
    ['United Kingdom', 1_704],
    ['Canada', 943],
    ['Germany', 731],
    ['Australia', 418],
  ]),
  top_referrers: createReferrerCounts([
    ['Instagram', 4_521],
    ['Direct', 2_134],
    ['Twitter/X', 1_876],
    ['TikTok', 1_203],
    ['Spotify', 891],
  ]),
  top_links: createTopLinks([
    ['spotify', 'Spotify', 3_245],
    ['apple-music', 'Apple Music', 2_187],
    ['youtube', 'YouTube', 1_654],
    ['soundcloud', 'SoundCloud', 823],
    ['bandcamp', 'Bandcamp', 412],
  ]),
  view: 'full',
};

type DemoTipper = EarningsResponse['tippers'][number];

const createDemoTipper = ({
  id,
  tipperName,
  contactEmail,
  amountCents,
  createdAt,
}: DemoTipper): DemoTipper => ({
  id,
  tipperName,
  contactEmail,
  amountCents,
  createdAt,
});

export const DEMO_EARNINGS_RESPONSE: EarningsResponse = {
  stats: {
    totalRevenueCents: 23_500,
    totalTips: 47,
    averageTipCents: 500,
  },
  tippers: [
    createDemoTipper({
      id: 'tipper-1',
      tipperName: 'Sam K.',
      contactEmail: 'sam@example.com',
      amountCents: 500,
      createdAt: '2026-04-12T18:30:00.000Z',
    }),
    createDemoTipper({
      id: 'tipper-2',
      tipperName: 'Anonymous',
      contactEmail: null,
      amountCents: 1000,
      createdAt: '2026-04-11T20:15:00.000Z',
    }),
    createDemoTipper({
      id: 'tipper-3',
      tipperName: 'Jordan B.',
      contactEmail: 'jordan@example.com',
      amountCents: 300,
      createdAt: '2026-04-10T12:00:00.000Z',
    }),
  ],
};

const DEMO_INSIGHT_PERIOD_START = '2026-03-16T00:00:00.000Z';
const DEMO_INSIGHT_PERIOD_END = '2026-04-15T23:59:59.000Z';

type DemoInsightFixture = Omit<
  InsightResponse,
  'status' | 'periodStart' | 'periodEnd'
>;

const createDemoInsight = ({
  createdAt,
  expiresAt,
  ...insight
}: DemoInsightFixture): InsightResponse => ({
  ...insight,
  status: 'active',
  periodStart: DEMO_INSIGHT_PERIOD_START,
  periodEnd: DEMO_INSIGHT_PERIOD_END,
  createdAt,
  expiresAt,
});

export const DEMO_INSIGHTS: InsightResponse[] = [
  createDemoInsight({
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
    createdAt: '2026-04-15T09:00:00.000Z',
    expiresAt: '2026-05-15T09:00:00.000Z',
  }),
  createDemoInsight({
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
    createdAt: '2026-04-15T09:05:00.000Z',
    expiresAt: '2026-05-15T09:05:00.000Z',
  }),
  createDemoInsight({
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
    createdAt: '2026-04-15T09:10:00.000Z',
    expiresAt: '2026-05-15T09:10:00.000Z',
  }),
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

export { DEMO_AUDIENCE_MEMBERS as DEMO_AUDIENCE_ROWS } from './mock-release-data';
