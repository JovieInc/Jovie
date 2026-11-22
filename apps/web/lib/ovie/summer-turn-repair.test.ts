import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/linear-coordination-live', () => ({
  linearGraphql: vi.fn(),
}));
vi.mock('@/lib/ovie/summer-production-pin', () => ({
  logSummerBridgeEvent: vi.fn(),
}));

import { logSummerBridgeEvent } from '@/lib/ovie/summer-production-pin';
import {
  fileSummerTurnRepair,
  resetSummerTurnRepairThrottle,
} from './summer-turn-repair';

const failure = (at: string) => ({
  hop: 'summer_unreachable',
  state: 'unknown',
  requestId: 'req_1',
  environment: 'preview',
  at: new Date(at),
});

describe('Summer founder-turn repair', () => {
  beforeEach(() => {
    resetSummerTurnRepairThrottle();
    vi.mocked(logSummerBridgeEvent).mockClear();
  });

  it('opens one repair issue for a hop with no open issue', async () => {
    const graphql = vi.fn(
      async (query: string, _variables?: Record<string, unknown>) => {
        if (query.includes('FindSummerTurnRepair'))
          return { issues: { nodes: [] } };
        if (query.includes('RepairLabel'))
          return { issueLabels: { nodes: [{ id: 'lbl', name: 'repair' }] } };
        return { issueCreate: { success: true } };
      }
    );
    await expect(
      fileSummerTurnRepair(failure('2026-11-22T10:37:00Z'), graphql as never)
    ).resolves.toBe('filed');
    const create = graphql.mock.calls.find(([q]) => q.includes('issueCreate'));
    expect(create?.[1]).toMatchObject({
      title: expect.stringContaining(
        '[summer-founder-turn:summer_unreachable]'
      ),
      labelIds: ['lbl'],
    });
  });

  it('comments on the open issue and throttles bursts into one note', async () => {
    const graphql = vi.fn(
      async (query: string, _variables?: Record<string, unknown>) =>
        query.includes('FindSummerTurnRepair')
          ? {
              issues: {
                nodes: [
                  {
                    id: 'iss',
                    title: '[summer-founder-turn:summer_unreachable] x',
                    state: { type: 'started' },
                  },
                ],
              },
            }
          : { commentCreate: { success: true } }
    );
    await fileSummerTurnRepair(
      failure('2026-11-22T10:00:00Z'),
      graphql as never
    );
    await expect(
      fileSummerTurnRepair(failure('2026-11-22T10:05:00Z'), graphql as never)
    ).resolves.toBe('throttled');
    await fileSummerTurnRepair(
      failure('2026-11-22T10:20:00Z'),
      graphql as never
    );
    const comments = graphql.mock.calls.filter(([q]) =>
      q.includes('commentCreate')
    );
    expect(comments).toHaveLength(2);
    expect(String(comments[1]?.[1]?.body)).toContain(
      '2 failures since the last note'
    );
  });

  it('logs loudly when the repair cannot be filed, and tries again next time', async () => {
    const graphql = vi.fn(async () => {
      throw new Error('LINEAR_API_KEY is not configured');
    });
    await expect(
      fileSummerTurnRepair(failure('2026-11-22T10:00:00Z'), graphql as never)
    ).resolves.toBe('failed');
    expect(logSummerBridgeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'summer_turn_repair_unfiled' })
    );
    await fileSummerTurnRepair(
      failure('2026-11-22T10:01:00Z'),
      graphql as never
    );
    expect(graphql).toHaveBeenCalledTimes(2);
  });
});
