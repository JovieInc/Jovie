import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test for JOV-10139 / Sentry 7645943506: the ingestion job
 * executor must never hold a database transaction across the external
 * `fetchAndExtract` phase. A pending external HTTP call inside an open
 * transaction leaves the Postgres session idle-in-transaction until Neon's
 * idle_in_transaction_session_timeout terminates the connection.
 */

const mocks = vi.hoisted(() => ({
  normalizeAndMergeExtraction: vi.fn(),
  enqueueFollowupIngestionJobs: vi.fn(),
  withSystemIngestionSession: vi.fn(),
}));

let sessionDepth = 0;
let updateCalls: Array<Record<string, unknown>> = [];

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: mocks.withSystemIngestionSession,
}));

vi.mock('@/lib/ingestion/merge', () => ({
  normalizeAndMergeExtraction: mocks.normalizeAndMergeExtraction,
}));

vi.mock('@/lib/ingestion/followup', () => ({
  enqueueFollowupIngestionJobs: mocks.enqueueFollowupIngestionJobs,
}));

import { z } from 'zod';
import { executeIngestionJob } from '@/lib/ingestion/jobs/executor';
import type { JobExecutorConfig } from '@/lib/ingestion/jobs/types';

const PROFILE_ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  usernameNormalized: 'someone',
  avatarUrl: null,
  displayName: 'Someone',
  avatarLockedByUser: null,
  displayNameLocked: null,
};

function fakeTx() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [PROFILE_ROW],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateCalls.push(values);
        return { where: async () => {} };
      },
    }),
  };
}

function makeConfig(
  fetchAndExtract: JobExecutorConfig<never>['fetchAndExtract']
) {
  return {
    payloadSchema: z.object({
      creatorProfileId: z.string(),
      sourceUrl: z.string(),
      depth: z.number(),
    }),
    platformName: 'Test',
    fetchAndExtract,
  } as unknown as JobExecutorConfig<{
    creatorProfileId: string;
    sourceUrl: string;
    depth: number;
  }>;
}

const payload = {
  creatorProfileId: PROFILE_ROW.id,
  sourceUrl: 'https://example.com/@someone',
  depth: 0,
};

describe('executeIngestionJob transaction boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionDepth = 0;
    updateCalls = [];
    mocks.withSystemIngestionSession.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        sessionDepth += 1;
        try {
          return await callback(fakeTx());
        } finally {
          sessionDepth -= 1;
        }
      }
    );
    mocks.normalizeAndMergeExtraction.mockResolvedValue({
      ok: true,
    });
    mocks.enqueueFollowupIngestionJobs.mockResolvedValue(undefined);
  });

  it('runs the external fetch with no ingestion session open', async () => {
    let sessionDepthDuringFetch: number | null = null;
    const config = makeConfig(async () => {
      sessionDepthDuringFetch = sessionDepth;
      return { links: [] };
    });

    await expect(executeIngestionJob(payload, config)).resolves.toMatchObject({
      sourceUrl: payload.sourceUrl,
      extractedLinks: 0,
    });

    // The external fetch must run OUTSIDE any transaction phase.
    expect(sessionDepthDuringFetch).toBe(0);
    // Exactly two short DB-only sessions: mark-processing and merge/idle.
    expect(mocks.withSystemIngestionSession.mock.calls.length).toBe(2);
  });

  it('runs the merge + followup commit inside a short ingestion session', async () => {
    let sessionDepthDuringMerge: number | null = null;
    mocks.normalizeAndMergeExtraction.mockImplementation(async () => {
      sessionDepthDuringMerge = sessionDepth;
      return { ok: true };
    });

    await executeIngestionJob(
      payload,
      makeConfig(async () => ({ links: [] }))
    );

    expect(sessionDepthDuringMerge).toBe(1);
  });

  it('marks the profile failed in a fresh session when the provider fetch throws', async () => {
    const config = makeConfig(async () => {
      throw new Error('provider fetch failed');
    });

    await expect(executeIngestionJob(payload, config)).rejects.toThrow(
      'provider fetch failed'
    );

    expect(
      updateCalls.some(values => values.ingestionStatus === 'failed')
    ).toBe(true);
    // Two sessions: mark-processing, then the standalone failed-status write.
    expect(mocks.withSystemIngestionSession.mock.calls.length).toBe(2);
  });
});
