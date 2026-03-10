import { beforeEach, describe, expect, it, vi } from 'vitest';

import { INSIGHT_MODEL } from '@/lib/constants/ai-models';
import type { MetricSnapshot } from '@/types/insights';

const { mockGenerateObject, mockGateway } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGateway: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}));

vi.mock('@ai-sdk/gateway', () => ({
  gateway: mockGateway,
}));

vi.mock('@/lib/services/insights/prompts', () => ({
  buildSystemPrompt: vi.fn(() => 'system prompt'),
  buildUserPrompt: vi.fn(() => 'user prompt'),
}));

const metricSnapshotFixture: MetricSnapshot = {
  period: {
    start: new Date('2026-01-01T00:00:00.000Z'),
    end: new Date('2026-01-31T00:00:00.000Z'),
  },
  comparisonPeriod: {
    start: new Date('2025-12-01T00:00:00.000Z'),
    end: new Date('2025-12-31T00:00:00.000Z'),
  },
  geographic: {
    currentTopCities: [],
    previousTopCities: [],
    cityGrowthRates: [],
    newCities: [],
    decliningCities: [],
  },
  traffic: {
    totalClicksCurrent: 0,
    totalClicksPrevious: 0,
    uniqueVisitorsCurrent: 0,
    uniqueVisitorsPrevious: 0,
    profileViewsCurrent: 0,
    profileViewsPrevious: 0,
  },
  subscribers: {
    newSubscribersCurrent: 0,
    newSubscribersPrevious: 0,
    unsubscribesCurrent: 0,
    unsubscribesPrevious: 0,
    totalActive: 0,
    subscriberCities: [],
  },
  revenue: {
    totalTipsCurrent: 0,
    totalTipsPrevious: 0,
    tipCountCurrent: 0,
    tipCountPrevious: 0,
    tipsByCity: [],
    averageTipCurrent: 0,
    averageTipPrevious: 0,
  },
  content: {
    clicksByLinkType: [],
    recentReleases: [],
  },
  tour: {
    upcomingShows: [],
    audienceCitiesWithoutShows: [],
  },
  engagement: {
    intentDistributionCurrent: [],
    intentDistributionPrevious: [],
    deviceDistribution: [],
    captureRateCurrent: 0,
    captureRatePrevious: 0,
  },
  referrers: {
    topReferrersCurrent: [],
    topReferrersPrevious: [],
    referrerGrowthRates: [],
  },
  temporal: {
    clicksByHour: [],
    clicksByDayOfWeek: [],
  },
  profile: {
    displayName: 'Artist',
    genres: [],
    spotifyFollowers: null,
    spotifyPopularity: null,
    creatorType: 'artist',
    totalAudienceMembers: 0,
    totalSubscribers: 0,
  },
};

describe('insight-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGateway.mockReturnValue('gateway-model');
  });

  it('calls AI gateway without anthropic provider options', async () => {
    mockGenerateObject.mockResolvedValue({
      object: {
        insights: [
          {
            insightType: 'city_growth',
            category: 'geographic',
            priority: 'high',
            title: 'Audience growth in Austin',
            description: 'Audience is up in Austin.',
            actionSuggestion: null,
            confidence: 0.8,
            dataSnapshot: {},
            expiresInDays: 30,
          },
        ],
      },
      usage: { inputTokens: 120, outputTokens: 80 },
    });

    const { generateInsights } = await import(
      '@/lib/services/insights/insight-generator'
    );

    await generateInsights(metricSnapshotFixture, []);

    expect(mockGateway).toHaveBeenCalledWith(INSIGHT_MODEL);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);

    const generateObjectArg = mockGenerateObject.mock.calls[0]?.[0];
    expect(generateObjectArg).toBeDefined();
    expect(generateObjectArg.providerOptions).toBeUndefined();
  });
});
