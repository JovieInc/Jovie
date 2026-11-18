import { beforeEach, describe, expect, it, vi } from 'vitest';

// JOV-7140: a confirmed Apple Music match links URLs onto existing releases
// AND adds the releases that exist only on Apple Music.

const mocks = vi.hoisted(() => ({
  enrich: vi.fn(),
  importApple: vi.fn(),
}));

vi.mock('@/lib/dsp-enrichment/jobs/release-enrichment', () => ({
  processReleaseEnrichmentJob: mocks.enrich,
}));
vi.mock('@/lib/discography/apple-music-import', () => ({
  importMissingAppleMusicReleases: mocks.importApple,
}));

import type { ingestionJobs } from '@/lib/db/schema/ingestion';
import { processJob } from '@/lib/ingestion/processor';

const profileId = '11111111-1111-4111-8111-111111111111';

const job = (providerId: string) =>
  ({
    id: '22222222-2222-4222-8222-222222222222',
    jobType: 'dsp_track_enrichment',
    payload: {
      creatorProfileId: profileId,
      matchId: 'm1',
      providerId,
      externalArtistId: '859547284',
    },
  }) as unknown as typeof ingestionJobs.$inferSelect;

describe('dsp_track_enrichment dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.importApple.mockResolvedValue({ imported: [] });
  });

  it('imports missing Apple Music releases after linking', async () => {
    const db = { __handle: true } as never;
    mocks.enrich.mockResolvedValue({
      creatorProfileId: profileId,
      providerId: 'apple_music',
      tracksEnriched: 0,
      releasesEnriched: 2,
      errors: [],
    });
    const result = await processJob(db, job('apple_music'));
    expect(mocks.importApple).toHaveBeenCalledWith(profileId, db);
    expect(result).toMatchObject({ releasesEnriched: 2 });
  });

  it('leaves Deezer enrichment as links only', async () => {
    mocks.enrich.mockResolvedValue({
      creatorProfileId: profileId,
      providerId: 'deezer',
      tracksEnriched: 0,
      releasesEnriched: 1,
      errors: [],
    });
    await processJob({} as never, job('deezer'));
    expect(mocks.importApple).not.toHaveBeenCalled();
  });
});
