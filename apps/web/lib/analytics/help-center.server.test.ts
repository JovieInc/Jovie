import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetRedis } = vi.hoisted(() => ({ mockGetRedis: vi.fn() }));

vi.mock('@/lib/redis', () => ({ getRedis: mockGetRedis }));

import type { HelpCenterEventPayload } from '../tracking/help-center-contract';
import {
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
  const bump = (map: Map<string, Map<string, number>>) => {
    return (key: string, member: string, amount: number) => {
      const inner = map.get(key) ?? new Map<string, number>();
      inner.set(member, (inner.get(member) ?? 0) + amount);
      map.set(key, inner);
    };
  };
  return {
    set: vi.fn(async (key: string) =>
      dedupe.has(key) ? null : (dedupe.add(key), 'OK')
    ),
    pipeline: () => {
      const ops: Array<() => void> = [];
      const push = (fn: () => void) => ops.push(fn);
      return {
        zincrby: (k: string, n: number, m: string) =>
          push(() => bump(zsets)(k, m, n)),
        hincrby: (k: string, f: string, n: number) =>
          push(() => bump(hashes)(k, f, n)),
        expire: () => push(() => undefined),
        sadd: () => push(() => undefined),
        exec: async () => ops.forEach(op => op()),
      };
    },
  };
}

describe('recordHelpCenterEvents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dedupes repeated event ids so retries cannot double-count', async () => {
    mockGetRedis.mockReturnValue(createRedis());
    expect(await recordHelpCenterEvents([FEEDBACK])).toEqual({
      accepted: 1,
      duplicates: 0,
    });
    expect(await recordHelpCenterEvents([FEEDBACK])).toEqual({
      accepted: 0,
      duplicates: 1,
    });
  });

  it('fails closed when the store is unavailable', async () => {
    mockGetRedis.mockReturnValue(null);
    await expect(recordHelpCenterEvents([FEEDBACK])).rejects.toBeInstanceOf(
      HelpCenterStoreUnavailableError
    );
  });
});
