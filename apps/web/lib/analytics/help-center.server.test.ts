import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetRedis } = vi.hoisted(() => ({ mockGetRedis: vi.fn() }));

vi.mock('@/lib/redis', () => ({ getRedis: mockGetRedis }));

import type { HelpCenterEventPayload } from '../tracking/help-center-contract';
import {
  deriveRemediationCandidates,
  HELP_CENTER_ESCALATION_THRESHOLD,
  HELP_CENTER_LOW_HELPFULNESS_MIN_RATINGS,
  HELP_CENTER_ZERO_RESULT_THRESHOLD,
  HelpCenterStoreUnavailableError,
  recordHelpCenterEvents,
} from './help-center.server';

const FEEDBACK: HelpCenterEventPayload = {
  schema_version: 1,
  event_id: 'evt-0001:article_feedback',
  event: 'article_feedback',
  article_id: 'features/tips',
  feedback: 'not_helpful',
};

function createRedis() {
  const dedupe = new Set<string>();
  const zsets = new Map<string, Map<string, number>>();
  const hashes = new Map<string, Map<string, number>>();
  return {
    dedupe,
    zsets,
    hashes,
    set: vi.fn(async (key: string) => {
      if (dedupe.has(key)) return null;
      dedupe.add(key);
      return 'OK';
    }),
    pipeline: () => {
      const ops: Array<() => void> = [];
      return {
        zincrby: (key: string, amount: number, member: string) => {
          ops.push(() => {
            const z = zsets.get(key) ?? new Map<string, number>();
            z.set(member, (z.get(member) ?? 0) + amount);
            zsets.set(key, z);
          });
        },
        hincrby: (key: string, field: string, amount: number) => {
          ops.push(() => {
            const h = hashes.get(key) ?? new Map<string, number>();
            h.set(field, (h.get(field) ?? 0) + amount);
            hashes.set(key, h);
          });
        },
        expire: () => ops.push(() => undefined),
        sadd: () => ops.push(() => undefined),
        exec: async () => ops.forEach(op => op()),
      };
    },
  };
}

describe('recordHelpCenterEvents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dedupes repeated event ids so retries cannot double-count', async () => {
    const redis = createRedis();
    mockGetRedis.mockReturnValue(redis);
    const first = await recordHelpCenterEvents([FEEDBACK]);
    const second = await recordHelpCenterEvents([FEEDBACK]);
    expect(first).toEqual({ accepted: 1, duplicates: 0 });
    expect(second).toEqual({ accepted: 0, duplicates: 1 });
  });

  it('fails closed when the store is unavailable', async () => {
    mockGetRedis.mockReturnValue(null);
    await expect(recordHelpCenterEvents([FEEDBACK])).rejects.toBeInstanceOf(
      HelpCenterStoreUnavailableError
    );
  });
});

describe('deriveRemediationCandidates', () => {
  it('emits one deterministic candidate per repeated failure signal', () => {
    const signals = {
      zeroResultQueries: [
        {
          query_hash: 'aaaabbbbccccdddd',
          count: HELP_CENTER_ZERO_RESULT_THRESHOLD,
        },
        { query_hash: 'eeeeffff00001111', count: 1 },
      ],
      articleHelpfulness: [
        {
          article_id: 'features/tips',
          helpful: 1,
          not_helpful: HELP_CENTER_LOW_HELPFULNESS_MIN_RATINGS,
          ratio_not_helpful: 0.75,
        },
      ],
      escalations: [
        {
          context: 'support_escalation:features/tips:article',
          count: HELP_CENTER_ESCALATION_THRESHOLD,
        },
      ],
    };
    const candidates = deriveRemediationCandidates(signals);
    expect(candidates).toHaveLength(3);
    expect(candidates.map(candidate => candidate.candidate_key)).toEqual([
      'help-center:zero-result:aaaabbbbccccdddd',
      'help-center:low-helpfulness:features/tips',
      'help-center:escalation:support_escalation:features/tips:article',
    ]);
    // Dedup is structural: re-deriving the same signals yields the same keys.
    expect(
      deriveRemediationCandidates(signals).map(c => c.candidate_key)
    ).toEqual(candidates.map(c => c.candidate_key));
  });

  it('suppresses signals below volume/confidence thresholds', () => {
    expect(
      deriveRemediationCandidates({
        zeroResultQueries: [{ query_hash: 'aaaabbbbccccdddd', count: 2 }],
        articleHelpfulness: [
          {
            article_id: 'features/tips',
            helpful: 5,
            not_helpful: 2,
            ratio_not_helpful: 0.28,
          },
        ],
        escalations: [],
      })
    ).toEqual([]);
  });
});
