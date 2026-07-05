import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import {
  adjustPromotedWeight,
  aggregateLlmCandidates,
  candidateLineKey,
  deriveStepFromToolEvents,
  MIN_CANDIDATE_CONVERSIONS,
  shouldPromoteCandidate,
} from '@/lib/onboarding/script-aggregation';

const CLEAN_TEXT =
  'Putting you on the early list — real spots open weekly and you keep your place.';

function toolCall(action: string, extra: Record<string, unknown> = {}) {
  return { toolName: 'x', output: { action, ...extra } };
}

describe('deriveStepFromToolEvents', () => {
  it('maps picker turns to get_artist', () => {
    expect(deriveStepFromToolEvents([toolCall('open_artist_picker')])).toBe(
      'get_artist'
    );
  });

  it('maps checkout turns to instant_access (outranks picker)', () => {
    expect(
      deriveStepFromToolEvents([
        toolCall('open_artist_picker'),
        toolCall('propose_checkout'),
      ])
    ).toBe('instant_access');
  });

  it('maps next-step decisions by kind', () => {
    expect(
      deriveStepFromToolEvents([
        toolCall('propose_next_step', { decision: { kind: 'waitlist' } }),
      ])
    ).toBe('waitlist');
    expect(
      deriveStepFromToolEvents([
        toolCall('propose_next_step', {
          decision: { kind: 'needs_more_info' },
        }),
      ])
    ).toBe('ask_audience');
  });

  it('returns null for text-only turns', () => {
    expect(deriveStepFromToolEvents([])).toBeNull();
    expect(deriveStepFromToolEvents(undefined)).toBeNull();
  });
});

describe('aggregateLlmCandidates', () => {
  const row = (
    conversationId: string,
    converted: boolean,
    content = CLEAN_TEXT
  ) => ({
    content,
    toolCalls: [
      toolCall('propose_next_step', { decision: { kind: 'waitlist' } }),
    ],
    conversationId,
    converted,
  });

  it('groups identical texts and counts distinct conversations', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row(`c${i}`, true));
    // Duplicate message in the same conversation must not double-count.
    rows.push(row('c0', true));
    const stats = aggregateLlmCandidates(rows);
    expect(stats).toHaveLength(1);
    expect(stats[0]?.stepId).toBe('waitlist');
    expect(stats[0]?.impressions).toBe(6);
    expect(stats[0]?.conversions).toBe(6);
  });

  it('drops texts below the conversion floor', () => {
    const rows = Array.from({ length: MIN_CANDIDATE_CONVERSIONS - 1 }, (_, i) =>
      row(`c${i}`, true)
    );
    expect(aggregateLlmCandidates(rows)).toHaveLength(0);
  });

  it('skips non-promotable steps (artist-specific copy)', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      content: CLEAN_TEXT,
      toolCalls: [toolCall('spotify_artist_confirmed')],
      conversationId: `c${i}`,
      converted: true,
    }));
    expect(aggregateLlmCandidates(rows)).toHaveLength(0);
  });

  it('skips too-short and too-long texts', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row(`c${i}`, true, 'ok.'));
    expect(aggregateLlmCandidates(rows)).toHaveLength(0);
  });
});

describe('shouldPromoteCandidate', () => {
  const base = { impressions: 40, conversions: 20, text: CLEAN_TEXT };

  it('promotes when rate beats best active by the lift factor', () => {
    expect(
      shouldPromoteCandidate({
        candidate: base, // 50%
        bestActive: { impressions: 40, conversions: 16 }, // 40% × 1.2 = 48%
      })
    ).toBe(true);
  });

  it('holds when lift is not met', () => {
    expect(
      shouldPromoteCandidate({
        candidate: base, // 50%
        bestActive: { impressions: 40, conversions: 18 }, // 45% × 1.2 = 54%
      })
    ).toBe(false);
  });

  it('holds without enough candidate volume', () => {
    expect(
      shouldPromoteCandidate({
        candidate: { ...base, impressions: 10, conversions: 9 },
        bestActive: { impressions: 40, conversions: 4 },
      })
    ).toBe(false);
  });

  it('holds without a measured baseline', () => {
    expect(shouldPromoteCandidate({ candidate: base, bestActive: null })).toBe(
      false
    );
    expect(
      shouldPromoteCandidate({
        candidate: base,
        bestActive: { impressions: 5, conversions: 1 },
      })
    ).toBe(false);
  });

  it('rejects lint-dirty candidates regardless of stats', () => {
    expect(
      shouldPromoteCandidate({
        candidate: {
          impressions: 100,
          conversions: 90,
          text: 'Excited to share this robust opportunity!!',
        },
        bestActive: { impressions: 40, conversions: 4 },
      })
    ).toBe(false);
  });
});

describe('adjustPromotedWeight', () => {
  it('waits for volume', () => {
    expect(
      adjustPromotedWeight({
        stats: { impressions: 10, conversions: 5 },
        bestSeedRate: 0.4,
      })
    ).toBeNull();
  });

  it('scales weight to relative rate, clamped to [10, 150]', () => {
    expect(
      adjustPromotedWeight({
        stats: { impressions: 100, conversions: 48 }, // 48% vs 40% seed
        bestSeedRate: 0.4,
      })
    ).toEqual({ weight: 120, retire: false });
    expect(
      adjustPromotedWeight({
        stats: { impressions: 100, conversions: 100 },
        bestSeedRate: 0.4,
      })
    ).toEqual({ weight: 150, retire: false });
  });

  it('retires lines that fall under half the seed rate', () => {
    expect(
      adjustPromotedWeight({
        stats: { impressions: 100, conversions: 10 }, // 10% vs 40% seed
        bestSeedRate: 0.4,
      })
    ).toEqual({ weight: 0, retire: true });
  });

  it('skips when no seed baseline exists', () => {
    expect(
      adjustPromotedWeight({
        stats: { impressions: 100, conversions: 50 },
        bestSeedRate: null,
      })
    ).toBeNull();
  });
});

describe('candidateLineKey', () => {
  it('is stable for identical text and unique per text', () => {
    const a = candidateLineKey('waitlist', CLEAN_TEXT);
    expect(a).toBe(candidateLineKey('waitlist', CLEAN_TEXT));
    expect(a).toMatch(/^waitlist:cand_[0-9a-f]{8}$/);
    expect(a).not.toBe(candidateLineKey('waitlist', `${CLEAN_TEXT} more`));
  });
});
