import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  musicfetch: vi.fn(),
  markProcessing: vi.fn(),
  markIdle: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock('@/lib/dsp-enrichment/jobs', () => ({
  processDspArtistDiscoveryJob: vi.fn(),
  processMusicFetchEnrichmentJob: mocks.musicfetch,
}));

vi.mock('@/lib/ingestion/status-manager', () => ({
  IngestionStatusManager: {
    markProcessing: mocks.markProcessing,
    markIdle: mocks.markIdle,
    markFailed: mocks.markFailed,
  },
}));

import type { ingestionJobs } from '@/lib/db/schema/ingestion';
import { processJob } from '@/lib/ingestion/processor';

const tx = {} as Parameters<typeof processJob>[0];
const profileId = '11111111-1111-4111-8111-111111111111';
const job: typeof ingestionJobs.$inferSelect = {
  id: '22222222-2222-4222-8222-222222222222',
  jobType: 'musicfetch_enrichment',
  status: 'pending',
  error: null,
  attempts: 0,
  runAt: new Date('2026-10-03T00:00:00Z'),
  priority: 0,
  maxAttempts: 3,
  nextRunAt: null,
  dedupKey: `musicfetch_enrichment:${profileId}`,
  createdAt: new Date('2026-10-03T00:00:00Z'),
  updatedAt: new Date('2026-10-03T00:00:00Z'),
  payload: {
    creatorProfileId: profileId,
    spotifyUrl: 'https://open.spotify.com/artist/1234567890123456789012',
    dedupKey: `musicfetch_enrichment:${profileId}`,
    recoveryClaimed: true,
  },
};

describe('musicfetch recovery status lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves the claimed recovery from processing to idle on success', async () => {
    const result = { status: 'complete', errors: [] };
    mocks.musicfetch.mockResolvedValue(result);

    await expect(processJob(tx, job)).resolves.toBe(result);

    expect(mocks.markProcessing).toHaveBeenCalledWith(tx, profileId);
    expect(mocks.markIdle).toHaveBeenCalledWith(tx, profileId);
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it('completes recovery when enrichment returns partial warnings', async () => {
    const result = {
      status: 'complete',
      errors: ['one release could not be imported'],
    };
    mocks.musicfetch.mockResolvedValue(result);

    await expect(processJob(tx, job)).resolves.toBe(result);

    expect(mocks.markIdle).toHaveBeenCalledWith(tx, profileId);
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it('keeps a terminal provider rejection failed', async () => {
    const result = {
      status: 'failed',
      errors: ['provider rejected the artist'],
    };
    mocks.musicfetch.mockResolvedValue(result);

    await expect(processJob(tx, job)).resolves.toBe(result);

    expect(mocks.markFailed).toHaveBeenCalledWith(
      tx,
      profileId,
      'provider rejected the artist'
    );
    expect(mocks.markIdle).not.toHaveBeenCalled();
  });

  it('leaves thrown failures for the scheduler retry policy', async () => {
    const error = new Error('provider timeout');
    mocks.musicfetch.mockRejectedValue(error);

    await expect(processJob(tx, job)).rejects.toBe(error);

    expect(mocks.markProcessing).toHaveBeenCalledWith(tx, profileId);
    expect(mocks.markIdle).not.toHaveBeenCalled();
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it('does not change profile status for ordinary enrichment jobs', async () => {
    const result = { status: 'complete', errors: [] };
    mocks.musicfetch.mockResolvedValue(result);

    await expect(
      processJob(tx, {
        ...job,
        payload: { ...job.payload, recoveryClaimed: undefined },
      })
    ).resolves.toBe(result);

    expect(mocks.markProcessing).not.toHaveBeenCalled();
    expect(mocks.markIdle).not.toHaveBeenCalled();
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });
});
