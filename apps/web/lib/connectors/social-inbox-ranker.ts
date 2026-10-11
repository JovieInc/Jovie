import { z } from 'zod';

export const SOCIAL_INBOX_IDENTITY_SIGNALS = [
  'anonymous',
  'known_fan',
  'collab',
  'press',
  'playlist_curator',
  'prior_conversion',
] as const;

export const SOCIAL_INBOX_INTENT_SIGNALS = [
  'other',
  'question',
  'collab_ask',
  'support',
  'complaint',
  'playlist',
  'sync',
  'emoji_only',
] as const;

export const SOCIAL_INBOX_RELATIONSHIP_SIGNALS = [
  'prior_thread',
  'repeat_commenter',
  'owned_catalog_match',
] as const;

const identitySignalSchema = z.enum(SOCIAL_INBOX_IDENTITY_SIGNALS);
const intentSignalSchema = z.enum(SOCIAL_INBOX_INTENT_SIGNALS);
const relationshipSignalSchema = z.enum(SOCIAL_INBOX_RELATIONSHIP_SIGNALS);

/** Structured, provider-independent evidence used by the v0 social ranker. */
export const socialInboxRankingSignalsSchema = z.object({
  identity: z.array(identitySignalSchema).max(6).default([]),
  intent: z.array(intentSignalSchema).max(8).default([]),
  unansweredInbound: z.boolean().default(true),
  relationship: z.array(relationshipSignalSchema).max(3).default([]),
  followerCount: z.number().int().nonnegative().safe().nullable().default(null),
  channelSize: z.number().int().nonnegative().safe().nullable().default(null),
  spam: z.boolean().default(false),
  youtubeLikelySpam: z.boolean().default(false),
  alreadyReplied: z.boolean().default(false),
  marketingOrBot: z.boolean().default(false),
});

export type SocialInboxRankingSignals = z.infer<
  typeof socialInboxRankingSignalsSchema
>;

export interface SocialInboxRankableDraft {
  readonly id: string;
  readonly authorKind: string;
  readonly inboundText: string;
  readonly inboundAt: string;
  readonly rankingSignals: SocialInboxRankingSignals;
}

export interface SocialInboxRankingPreferences {
  readonly featureAdjustments: Readonly<Record<string, number>>;
}

export interface SocialInboxFeedbackSample {
  readonly outcome: 'positive' | 'negative';
  readonly featureKeys: readonly string[];
}

const IDENTITY_WEIGHTS: Readonly<Record<string, number>> = {
  anonymous: 4,
  known_fan: 24,
  collab: 36,
  press: 32,
  playlist_curator: 32,
  prior_conversion: 42,
};

const INTENT_WEIGHTS: Readonly<Record<string, number>> = {
  other: 0,
  question: 24,
  collab_ask: 36,
  support: 30,
  complaint: 30,
  playlist: 32,
  sync: 36,
  emoji_only: -22,
};

const RELATIONSHIP_WEIGHTS: Readonly<Record<string, number>> = {
  prior_thread: 14,
  repeat_commenter: 12,
  owned_catalog_match: 22,
};

const RECENCY_MAX = 16;
const RECENCY_HALF_LIFE_HOURS = 72;
const REACH_MAX = 18;
const LEARNED_ADJUSTMENT_PER_FEATURE_MAX = 12;
const LEARNED_ADJUSTMENT_TOTAL_MAX = 30;

const AUTHOR_IDENTITY_FALLBACKS: Readonly<Record<string, string>> = {
  fan: 'known_fan',
  collab: 'collab',
  press: 'press',
  playlist: 'playlist_curator',
  anonymous: 'anonymous',
};

const AUTHOR_INTENT_FALLBACKS: Readonly<Record<string, string>> = {
  collab: 'collab_ask',
  playlist: 'playlist',
};

const EMPTY_PREFERENCES: SocialInboxRankingPreferences = {
  featureAdjustments: {},
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function isEmojiOnly(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || !/\p{Extended_Pictographic}/u.test(trimmed)) return false;
  return (
    trimmed.replaceAll(/[\p{Extended_Pictographic}\p{Emoji_Component}\s]/gu, '')
      .length === 0
  );
}

function resolveSignals(draft: SocialInboxRankableDraft): {
  readonly identity: readonly string[];
  readonly intent: readonly string[];
  readonly relationship: readonly string[];
} {
  const identity: string[] = [...draft.rankingSignals.identity];
  if (identity.length === 0) {
    identity.push(AUTHOR_IDENTITY_FALLBACKS[draft.authorKind] ?? 'anonymous');
  }

  const intent: string[] = [...draft.rankingSignals.intent];
  const authorIntent = AUTHOR_INTENT_FALLBACKS[draft.authorKind];
  if (authorIntent && !intent.includes(authorIntent)) intent.push(authorIntent);
  if (draft.inboundText.includes('?') && !intent.includes('question')) {
    intent.push('question');
  }
  if (isEmojiOnly(draft.inboundText) && !intent.includes('emoji_only')) {
    intent.push('emoji_only');
  }
  if (intent.length === 0) intent.push('other');

  return {
    identity: unique(identity),
    intent: unique(intent),
    relationship: unique(draft.rankingSignals.relationship),
  };
}

function reachScore(signals: SocialInboxRankingSignals): number {
  const audienceSize = Math.max(
    signals.followerCount ?? 0,
    signals.channelSize ?? 0
  );
  return Math.min(REACH_MAX, Math.log10(audienceSize + 1) * 3);
}

function reachFeature(signals: SocialInboxRankingSignals): string {
  const audienceSize = Math.max(
    signals.followerCount ?? 0,
    signals.channelSize ?? 0
  );
  if (audienceSize === 0) return 'reach:none';
  if (audienceSize < 1_000) return 'reach:small';
  if (audienceSize < 10_000) return 'reach:medium';
  if (audienceSize < 100_000) return 'reach:large';
  return 'reach:very_large';
}

function recencyScore(inboundAt: string, now: Date): number {
  const inboundMs = Date.parse(inboundAt);
  if (!Number.isFinite(inboundMs)) return 0;
  const ageHours = Math.max(0, (now.getTime() - inboundMs) / 3_600_000);
  return RECENCY_MAX * 2 ** (-ageHours / RECENCY_HALF_LIFE_HOURS);
}

export function socialInboxFeatureKeysForDraft(
  draft: SocialInboxRankableDraft
): readonly string[] {
  const signals = resolveSignals(draft);
  const keys = [
    ...signals.identity.map(signal => `identity:${signal}`),
    ...signals.intent.map(signal => `intent:${signal}`),
    ...signals.relationship.map(signal => `relationship:${signal}`),
    reachFeature(draft.rankingSignals),
  ];
  if (draft.rankingSignals.unansweredInbound) keys.push('state:unanswered');
  if (draft.rankingSignals.spam) keys.push('minus:spam');
  if (draft.rankingSignals.youtubeLikelySpam) {
    keys.push('minus:youtube_likely_spam');
  }
  if (draft.rankingSignals.alreadyReplied) keys.push('minus:already_replied');
  if (draft.rankingSignals.marketingOrBot) keys.push('minus:marketing_or_bot');
  return unique(keys);
}

/**
 * Deterministic v0 score. Recency contributes a decaying boost but is never a
 * tie-breaker; equal scores use the stable action id.
 */
export function scoreSocialInboxDraft(
  draft: SocialInboxRankableDraft,
  options?: {
    readonly now?: Date;
    readonly preferences?: SocialInboxRankingPreferences;
  }
): number {
  const signals = resolveSignals(draft);
  const preferences = options?.preferences ?? EMPTY_PREFERENCES;
  let score = 0;

  for (const signal of signals.identity) {
    score += IDENTITY_WEIGHTS[signal] ?? 0;
  }
  for (const signal of signals.intent) {
    score += INTENT_WEIGHTS[signal] ?? 0;
  }
  if (
    draft.rankingSignals.unansweredInbound &&
    !draft.rankingSignals.alreadyReplied
  ) {
    score += 30;
  }
  for (const signal of signals.relationship) {
    score += RELATIONSHIP_WEIGHTS[signal] ?? 0;
  }
  score += reachScore(draft.rankingSignals);
  score += recencyScore(draft.inboundAt, options?.now ?? new Date());

  if (draft.rankingSignals.spam) score -= 100;
  if (draft.rankingSignals.youtubeLikelySpam) score -= 100;
  if (draft.rankingSignals.alreadyReplied) score -= 45;
  if (draft.rankingSignals.marketingOrBot) score -= 80;

  let learnedAdjustment = 0;
  for (const feature of socialInboxFeatureKeysForDraft(draft)) {
    learnedAdjustment += clamp(
      preferences.featureAdjustments[feature] ?? 0,
      -LEARNED_ADJUSTMENT_PER_FEATURE_MAX,
      LEARNED_ADJUSTMENT_PER_FEATURE_MAX
    );
  }
  score += clamp(
    learnedAdjustment,
    -LEARNED_ADJUSTMENT_TOTAL_MAX,
    LEARNED_ADJUSTMENT_TOTAL_MAX
  );

  return Math.round(score * 1_000) / 1_000;
}

export function rankSocialInboxDrafts<T extends SocialInboxRankableDraft>(
  drafts: readonly T[],
  options?: {
    readonly now?: Date;
    readonly preferences?: SocialInboxRankingPreferences;
  }
): T[] {
  return drafts
    .map(draft => ({
      draft,
      score: scoreSocialInboxDraft(draft, options),
    }))
    .sort((a, b) => b.score - a.score || a.draft.id.localeCompare(b.draft.id))
    .map(entry => entry.draft);
}

/** Bayesian shrinkage keeps one vote small while repeated feedback compounds. */
export function learnSocialInboxRankingPreferences(
  samples: readonly SocialInboxFeedbackSample[]
): SocialInboxRankingPreferences {
  const counts = new Map<string, { positive: number; negative: number }>();
  for (const sample of samples) {
    for (const feature of unique(sample.featureKeys)) {
      const current = counts.get(feature) ?? { positive: 0, negative: 0 };
      current[sample.outcome] += 1;
      counts.set(feature, current);
    }
  }

  return {
    featureAdjustments: Object.fromEntries(
      [...counts.entries()].map(([feature, count]) => {
        const total = count.positive + count.negative;
        const adjustment =
          (LEARNED_ADJUSTMENT_PER_FEATURE_MAX *
            (count.positive - count.negative)) /
          (total + 3);
        return [feature, adjustment];
      })
    ),
  };
}

export function parseSocialInboxFeedbackSample(
  context: unknown
): SocialInboxFeedbackSample | null {
  if (!context || typeof context !== 'object') return null;
  const record = context as Record<string, unknown>;
  const rawFeatures = record.socialInboxFeatureKeys;
  if (!Array.isArray(rawFeatures)) return null;
  const featureKeys = rawFeatures.filter(
    (feature): feature is string =>
      typeof feature === 'string' && feature.length > 0 && feature.length <= 80
  );
  if (featureKeys.length === 0) return null;

  const outcome =
    record.rating === 'positive' || record.verdict === 'approved'
      ? 'positive'
      : record.rating === 'negative' || record.verdict === 'rejected'
        ? 'negative'
        : null;
  return outcome ? { outcome, featureKeys } : null;
}
