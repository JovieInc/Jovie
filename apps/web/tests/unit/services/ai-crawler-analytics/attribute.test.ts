import { describe, expect, it } from 'vitest';
import type { RawAiCrawlerRequestRow } from '@/lib/cloudflare/ai-crawler-analytics-fetch';
import { attributeAiCrawlerRows } from '@/lib/services/ai-crawler-analytics/attribute';

describe('attributeAiCrawlerRows', () => {
  const periodStart = new Date('2026-06-01T00:00:00.000Z');
  const weeklyCutoff = new Date('2026-06-24T00:00:00.000Z');

  const profiles = [
    { profileId: 'profile-1', usernameNormalized: 'timwhite' },
    { profileId: 'profile-2', usernameNormalized: 'calvin' },
  ];

  it('attributes AI crawler requests to the matching profile handle', () => {
    const currentRows: RawAiCrawlerRequestRow[] = [
      {
        count: 12,
        path: '/timwhite',
        userAgent: 'GPTBot/1.0',
        hour: '2026-06-25T10:00:00.000Z',
      },
      {
        count: 4,
        path: '/timwhite/releases',
        userAgent: 'ClaudeBot/1.0',
        hour: '2026-06-26T08:00:00.000Z',
      },
      {
        count: 99,
        path: '/api/health',
        userAgent: 'GPTBot/1.0',
        hour: '2026-06-25T10:00:00.000Z',
      },
    ];

    const previousRows: RawAiCrawlerRequestRow[] = [
      {
        count: 3,
        path: '/timwhite',
        userAgent: 'GPTBot/1.0',
        hour: '2026-05-20T10:00:00.000Z',
      },
    ];

    const aggregates = attributeAiCrawlerRows(
      profiles,
      currentRows,
      previousRows,
      periodStart,
      weeklyCutoff
    );

    expect(aggregates).toHaveLength(1);
    expect(aggregates[0]).toMatchObject({
      profileId: 'profile-1',
      totalRequests: 16,
      weeklyRequests: 16,
    });
    expect(aggregates[0]?.crawlers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'gptbot', requests: 12 }),
        expect.objectContaining({ id: 'claudebot', requests: 4 }),
      ])
    );
  });
});