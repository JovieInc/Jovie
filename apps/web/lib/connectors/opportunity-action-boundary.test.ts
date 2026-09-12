import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateWhere: vi.fn(),
  readWhere: vi.fn(),
  record: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({ set: () => ({ where: mocks.updateWhere }) }),
    select: () => ({ from: () => ({ where: mocks.readWhere }) }),
  },
}));
vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: async () => ({ userId: 'owner', error: null }),
}));
vi.mock('@/lib/connectors/inbox-decision', () => ({
  recordInboxDecision: mocks.record,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
vi.mock('@/lib/youtube-library', () => ({
  reconcileThumbnailCandidateDecision: vi.fn(),
  YouTubeThumbnailDecisionError: class YouTubeThumbnailDecisionError extends Error {},
}));

import { POST as nextStep } from '@/app/api/connectors/suggested-actions/[id]/next-step/route';
import { POST as reject } from '@/app/api/connectors/suggested-actions/[id]/reject/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateWhere.mockReturnValue({ returning: async () => [] });
  mocks.readWhere.mockReturnValue({ limit: async () => [] });
});

describe('stale consumer action links cannot mutate Ovie captures', () => {
  it.each([
    ['reject', reject, '<>', 'workflow_capture.request'],
    ['next-step', nextStep, '=', 'experiment.report'],
  ] as const)(
    '%s restricts both mutation and retry lookup by owned kind',
    async (name, action, operator, kind) => {
      if (name === 'reject') {
        mocks.readWhere.mockReturnValueOnce({
          limit: async () => [
            {
              kind: 'brand_deal.opportunity',
              payload: {},
              status: 'pending',
            },
          ],
        });
      }
      const response = await action(
        new Request('https://jov.ie/api', { method: 'POST' }),
        { params: Promise.resolve({ id: 'capture' }) }
      );
      expect(response.status).toBe(404);
      for (const mock of [mocks.updateWhere, mocks.readWhere]) {
        const query = new PgDialect().sqlToQuery(mock.mock.calls[0][0]);
        expect(query.sql).toContain(`"suggested_actions"."kind" ${operator}`);
        expect(query.params).toContain(kind);
        expect(query.params).toContain('owner');
        expect(query.params).toContain('capture');
      }
      expect(mocks.record).not.toHaveBeenCalled();
    }
  );
});
