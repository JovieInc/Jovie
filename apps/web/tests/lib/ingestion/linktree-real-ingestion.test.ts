import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as rerun } from '@/app/api/admin/creator-ingest/rerun/route';
import { extractAvatarCandidateFromLinkUrl } from '@/lib/ingestion/avatar/candidate-extractor';
import {
  fetchFullExtractionProfile,
  resolveFullExtractionContext,
} from '@/lib/ingestion/flows/full-extraction-flow';
import {
  enqueueInstagramIngestionJob,
  enqueueLinktreeIngestionJob,
} from '@/lib/ingestion/jobs';
import { processJob } from '@/lib/ingestion/processor';
import { scheduleIngestionJobs } from '@/lib/services/social-links/ingestion';

const { dbMock } = vi.hoisted(() => ({
  dbMock: { insert: vi.fn(), select: vi.fn(), update: vi.fn() },
}));
vi.mock('@/lib/db', () => ({ db: dbMock }));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  requireOvieApiAccess: vi.fn(async () => null),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('retired HTML ingestion entry points', () => {
  const urls = ['https://linktr.ee/artist', 'https://www.instagram.com/artist'];

  it.each([
    { enqueue: enqueueLinktreeIngestionJob, url: urls[0] },
    { enqueue: enqueueInstagramIngestionJob, url: urls[1] },
  ])(
    'rejects direct enqueue without querying or writing scraper jobs ($url)',
    async ({ enqueue, url }) => {
      await expect(
        enqueue({ creatorProfileId: 'profile-id', sourceUrl: url })
      ).rejects.toMatchObject({
        code: 'SOCIAL_HTML_DISABLED',
      });
      expect(dbMock.select).not.toHaveBeenCalled();
      expect(dbMock.insert).not.toHaveBeenCalled();
    }
  );

  it.each(['import_linktree', 'import_instagram'])(
    'rejects persisted %s jobs without touching profile data',
    async jobType => {
      await expect(
        processJob(dbMock as never, { jobType, payload: {} } as never)
      ).rejects.toMatchObject({
        code: 'SOCIAL_HTML_DISABLED',
      });
      expect(dbMock.select).not.toHaveBeenCalled();
      expect(dbMock.update).not.toHaveBeenCalled();
    }
  );

  it.each(urls)(
    'skips blocked avatar sources before any HTML fallback (%s)',
    async url => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(extractAvatarCandidateFromLinkUrl(url)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('does not enqueue HTML imports when social links are saved', async () => {
    await scheduleIngestionJobs(
      'profile-id',
      urls.map(url => ({ platform: 'other', url }))
    );
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('returns an explicit unsupported response for legacy admin reruns', async () => {
    const response = await rerun(
      new Request('http://localhost/api/admin/creator-ingest/rerun', {
        method: 'POST',
        body: JSON.stringify({
          profileId: '7e093f2b-a8f9-4559-a9df-8f789b4432f8',
        }),
      })
    );
    expect(response.status).toBe(422);
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it('rejects a Linktree full import before resolving or updating a profile', async () => {
    const context = resolveFullExtractionContext(urls[0], false, urls[0]);
    expect(context.ok).toBe(false);
    if (!context.ok) expect(context.response.status).toBe(422);
    await expect(
      fetchFullExtractionProfile(false, urls[0], 'artist')
    ).rejects.toMatchObject({
      code: 'SOCIAL_HTML_DISABLED',
    });
  });
});
