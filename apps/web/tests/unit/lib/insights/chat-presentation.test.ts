import { describe, expect, it } from 'vitest';
import {
  buildInsightPrompt,
  sortInsightsForChat,
} from '@/lib/insights/chat-presentation';
import type { InsightResponse } from '@/types/insights';

function createInsight(overrides: Partial<InsightResponse>): InsightResponse {
  return {
    id: overrides.id ?? 'insight-id',
    insightType: overrides.insightType ?? 'peak_activity',
    category: overrides.category ?? 'timing',
    priority: overrides.priority ?? 'low',
    title: overrides.title ?? 'Default insight',
    description: overrides.description ?? 'Default description',
    actionSuggestion: overrides.actionSuggestion ?? null,
    confidence: overrides.confidence ?? '0.7',
    status: overrides.status ?? 'active',
    periodStart: overrides.periodStart ?? '2026-03-01T00:00:00.000Z',
    periodEnd: overrides.periodEnd ?? '2026-03-07T00:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-03-08T00:00:00.000Z',
    expiresAt: overrides.expiresAt ?? '2026-03-15T00:00:00.000Z',
  };
}

describe('chat insight presentation', () => {
  it('prioritizes monetization and subscriber signals ahead of lower-value timing signals', () => {
    const sorted = sortInsightsForChat([
      createInsight({
        id: 'timing',
        insightType: 'peak_activity',
        category: 'timing',
        priority: 'high',
      }),
      createInsight({
        id: 'subscriber',
        insightType: 'subscriber_surge',
        category: 'growth',
        priority: 'medium',
      }),
      createInsight({
        id: 'revenue',
        insightType: 'tip_hotspot',
        category: 'revenue',
        priority: 'medium',
      }),
    ]);

    expect(sorted.map(insight => insight.id)).toEqual([
      'subscriber',
      'revenue',
      'timing',
    ]);
  });

  it('builds a concrete release prompt for release momentum insights', () => {
    expect(
      buildInsightPrompt(
        createInsight({
          insightType: 'release_momentum',
          title: 'New single is breaking through',
        })
      )
    ).toBe('Which release is getting traction right now?');
  });
});
