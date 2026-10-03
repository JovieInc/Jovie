import { describe, expect, it } from 'vitest';
import {
  learnSocialInboxRankingPreferences,
  rankSocialInboxDrafts,
  scoreSocialInboxDraft,
  socialInboxRankingSignalsSchema,
} from './social-inbox-ranker';

function draft(
  overrides: Partial<{
    id: string;
    authorKind: string;
    inboundText: string;
    inboundAt: string;
    rankingSignals: Parameters<typeof socialInboxRankingSignalsSchema.parse>[0];
  }> = {}
) {
  return {
    id: overrides.id ?? 'draft-1',
    authorKind: overrides.authorKind ?? 'anonymous',
    inboundText: overrides.inboundText ?? 'Hello',
    inboundAt: overrides.inboundAt ?? '2026-10-02T12:00:00.000Z',
    rankingSignals: socialInboxRankingSignalsSchema.parse(
      overrides.rankingSignals ?? {}
    ),
  };
}

describe('social inbox ROI ranker', () => {
  const now = new Date('2026-10-02T12:00:00.000Z');

  it('ranks a three-day unanswered collab above a five-minute fire emoji', () => {
    const ranked = rankSocialInboxDrafts(
      [
        draft({
          id: 'fresh-fire',
          inboundText: '🔥',
          inboundAt: '2026-10-02T11:55:00.000Z',
        }),
        draft({
          id: 'older-collab',
          authorKind: 'collab',
          inboundText: 'Want to collaborate on a remix?',
          inboundAt: '2026-09-29T12:00:00.000Z',
        }),
      ],
      { now }
    );

    expect(ranked.map(item => item.id)).toEqual(['older-collab', 'fresh-fire']);
  });

  it('caps reach so a spam influencer cannot dominate', () => {
    const spamInfluencer = draft({
      id: 'spam',
      inboundAt: '2026-10-02T11:59:00.000Z',
      rankingSignals: {
        followerCount: 100_000_000,
        spam: true,
        marketingOrBot: true,
      },
    });
    const knownFan = draft({
      id: 'fan',
      authorKind: 'fan',
      inboundAt: '2026-09-30T12:00:00.000Z',
      rankingSignals: { relationship: ['repeat_commenter'] },
    });

    expect(scoreSocialInboxDraft(knownFan, { now })).toBeGreaterThan(
      scoreSocialInboxDraft(spamInfluencer, { now })
    );
  });

  it('penalizes YouTube likelySpam and already-replied items', () => {
    const actionable = draft({ id: 'actionable', authorKind: 'press' });
    const handledSpam = draft({
      id: 'handled-spam',
      authorKind: 'press',
      rankingSignals: {
        youtubeLikelySpam: true,
        alreadyReplied: true,
      },
    });

    expect(scoreSocialInboxDraft(actionable, { now })).toBeGreaterThan(
      scoreSocialInboxDraft(handledSpam, { now })
    );
  });

  it('learns bounded per-artist adjustments from repeated positive and negative feedback', () => {
    const preferences = learnSocialInboxRankingPreferences([
      ...Array.from({ length: 8 }, () => ({
        outcome: 'positive' as const,
        featureKeys: ['intent:question'],
      })),
      ...Array.from({ length: 8 }, () => ({
        outcome: 'negative' as const,
        featureKeys: ['intent:emoji_only'],
      })),
    ]);
    const question = draft({
      id: 'question',
      inboundText: 'Will you play Detroit?',
    });
    const emoji = draft({ id: 'emoji', inboundText: '🔥' });

    expect(preferences.featureAdjustments['intent:question']).toBeGreaterThan(
      0
    );
    expect(preferences.featureAdjustments['intent:emoji_only']).toBeLessThan(0);
    expect(
      scoreSocialInboxDraft(question, { now, preferences }) -
        scoreSocialInboxDraft(emoji, { now, preferences })
    ).toBeGreaterThan(
      scoreSocialInboxDraft(question, { now }) -
        scoreSocialInboxDraft(emoji, { now })
    );
  });

  it('uses stable ids rather than recency as an equal-score tie-breaker', () => {
    const ranked = rankSocialInboxDrafts(
      [draft({ id: 'b' }), draft({ id: 'a' })],
      { now }
    );
    expect(ranked.map(item => item.id)).toEqual(['a', 'b']);
  });
});
