import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for JOV-10139: every social import processor must
 * delegate to executeIngestionJob WITHOUT a database handle. The executor
 * owns short DB-only transaction phases; processors must never accept or
 * forward a transaction, so no transaction can ever span the external fetch.
 */

const mocks = vi.hoisted(() => ({
  executeIngestionJob: vi.fn(),
}));

vi.mock('@/lib/ingestion/jobs/executor', () => ({
  executeIngestionJob: mocks.executeIngestionJob,
}));

import { processBeaconsJob } from '@/lib/ingestion/jobs/beacons';
import { processLayloJob } from '@/lib/ingestion/jobs/laylo';
import { processTikTokJob } from '@/lib/ingestion/jobs/tiktok';
import { processTwitterJob } from '@/lib/ingestion/jobs/twitter';
import { processYouTubeJob } from '@/lib/ingestion/jobs/youtube';

const payload = {
  creatorProfileId: '11111111-1111-4111-8111-111111111111',
  sourceUrl: 'https://example.com/@someone',
  depth: 0,
};

describe('social import processors delegate without a db handle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.executeIngestionJob.mockResolvedValue({
      ok: true,
      sourceUrl: payload.sourceUrl,
      extractedLinks: 0,
    });
  });

  it('processTikTokJob forwards only the payload', async () => {
    await processTikTokJob(payload);
    expect(mocks.executeIngestionJob).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ platformName: 'TikTok' })
    );
  });

  it('processTwitterJob forwards only the payload', async () => {
    await processTwitterJob(payload);
    expect(mocks.executeIngestionJob).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ platformName: 'Twitter' })
    );
  });

  it('processYouTubeJob forwards only the payload', async () => {
    await processYouTubeJob(payload);
    expect(mocks.executeIngestionJob).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ platformName: 'YouTube' })
    );
  });

  it('processBeaconsJob forwards only the payload', async () => {
    await processBeaconsJob(payload);
    expect(mocks.executeIngestionJob).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ platformName: 'Beacons' })
    );
  });

  it('processLayloJob forwards only the payload', async () => {
    await processLayloJob(payload);
    expect(mocks.executeIngestionJob).toHaveBeenCalledWith(
      payload,
      expect.objectContaining({ platformName: 'Laylo' })
    );
  });
});
