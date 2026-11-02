import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for JOV-10139: the processJob dispatch routes social
 * import jobs to processors that own their own short transaction phases.
 * Social processors receive ONLY the payload — no database handle — so no
 * transaction can span their external fetches.
 */

const mocks = vi.hoisted(() => ({
  beacons: vi.fn(),
  laylo: vi.fn(),
  tiktok: vi.fn(),
  twitter: vi.fn(),
  youtube: vi.fn(),
}));

vi.mock('@/lib/ingestion/jobs/beacons', () => ({
  processBeaconsJob: mocks.beacons,
  beaconsJobConfig: {},
}));
vi.mock('@/lib/ingestion/jobs/laylo', () => ({
  processLayloJob: mocks.laylo,
  layloJobConfig: {},
}));
vi.mock('@/lib/ingestion/jobs/tiktok', () => ({
  processTikTokJob: mocks.tiktok,
  tiktokJobConfig: {},
}));
vi.mock('@/lib/ingestion/jobs/twitter', () => ({
  processTwitterJob: mocks.twitter,
  twitterJobConfig: {},
}));
vi.mock('@/lib/ingestion/jobs/youtube', () => ({
  processYouTubeJob: mocks.youtube,
  youtubeJobConfig: {},
}));

import type { ingestionJobs } from '@/lib/db/schema/ingestion';
import { processJob } from '@/lib/ingestion/processor';

const profileId = '11111111-1111-4111-8111-111111111111';

function makeJob(jobType: string): typeof ingestionJobs.$inferSelect {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    jobType,
    status: 'pending',
    error: null,
    attempts: 0,
    runAt: new Date('2026-10-31T00:00:00Z'),
    priority: 0,
    maxAttempts: 3,
    nextRunAt: null,
    dedupKey: `${jobType}:${profileId}`,
    createdAt: new Date('2026-10-31T00:00:00Z'),
    updatedAt: new Date('2026-10-31T00:00:00Z'),
    payload: {
      creatorProfileId: profileId,
      sourceUrl: 'https://example.com/@someone',
      depth: 0,
    },
  } as typeof ingestionJobs.$inferSelect;
}

describe('processJob social dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of Object.values(mocks)) m.mockResolvedValue({ ok: true });
  });

  it.each([
    ['import_beacons', 'beacons'],
    ['import_laylo', 'laylo'],
    ['import_tiktok', 'tiktok'],
    ['import_twitter', 'twitter'],
    ['import_youtube', 'youtube'],
  ] as const)(
    '%s routes to its processor with the payload only',
    async (jobType, mock) => {
      const db = { __poolHandle: true } as never;
      await processJob(db, makeJob(jobType));

      expect(mocks[mock]).toHaveBeenCalledTimes(1);
      const [handle, payload] = mocks[mock].mock.calls[0];
      // Social processors take (payload) only — a second db-handle argument
      // would mean a transaction could span the external fetch.
      expect(handle).toBeUndefined();
      expect(handle).not.toBe(db);
      expect(payload).toMatchObject({ creatorProfileId: profileId });
    }
  );
});
