import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  musicfetch: vi.fn(),
  processing: vi.fn(),
  idle: vi.fn(),
  failed: vi.fn(),
}));

vi.mock('@/lib/dsp-enrichment/jobs', () => ({
  processDspArtistDiscoveryJob: vi.fn(),
  processMusicFetchEnrichmentJob: mocks.musicfetch,
}));
vi.mock('@/lib/ingestion/status-manager', () => ({
  IngestionStatusManager: {
    markProcessing: mocks.processing,
    markIdle: mocks.idle,
    markFailed: mocks.failed,
  },
}));

import type { ingestionJobs } from '@/lib/db/schema/ingestion';
import { processJob } from '@/lib/ingestion/processor';

const tx = {} as Parameters<typeof processJob>[0];
const profileId = '11111111-1111-4111-8111-111111111111';
const job = {
  id: 'job-1',
  jobType: 'musicfetch_enrichment',
  payload: {
    creatorProfileId: profileId,
    spotifyUrl: 'https://open.spotify.com/artist/1234567890123456789012',
    dedupKey: `musicfetch_enrichment:${profileId}`,
    recoveryClaimed: true,
  },
} as typeof ingestionJobs.$inferSelect;

describe('musicfetch recovery status lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [{ status: 'complete', errors: [] }, 'idle'],
    [{ status: 'complete', errors: ['partial warning'] }, 'idle'],
    [{ status: 'failed', errors: ['provider rejected'] }, 'failed'],
  ] as const)('finishes %o as %s', async (result, finalState) => {
    mocks.musicfetch.mockResolvedValue(result);

    await expect(processJob(tx, job)).resolves.toBe(result);

    expect(mocks.processing).toHaveBeenCalledWith(tx, profileId);
    expect(mocks.idle).toHaveBeenCalledTimes(finalState === 'idle' ? 1 : 0);
    expect(mocks.failed).toHaveBeenCalledTimes(finalState === 'failed' ? 1 : 0);
  });

  it('does not change status for ordinary enrichment jobs', async () => {
    mocks.musicfetch.mockResolvedValue({ status: 'complete', errors: [] });
    await processJob(tx, {
      ...job,
      payload: { ...job.payload, recoveryClaimed: undefined },
    });
    expect(mocks.processing).not.toHaveBeenCalled();
    expect(mocks.idle).not.toHaveBeenCalled();
  });
});
