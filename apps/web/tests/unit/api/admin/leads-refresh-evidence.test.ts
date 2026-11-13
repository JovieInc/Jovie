import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadEvidenceRefreshResult } from '@/lib/leads/ingest-lead';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  lead: [] as unknown[],
  refresh: vi.fn(),
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mocks.access,
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => mocks.lead }) }),
    }),
  },
}));
vi.mock('@/lib/leads/ingest-lead', () => ({
  refreshLeadProfileEvidence: mocks.refresh,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
  getSafeErrorMessage: () => 'safe',
}));

import { POST } from '@/app/api/admin/leads/[id]/refresh-evidence/route';
import { fetchWithTimeout } from '@/lib/queries/fetch';

const accepted: LeadEvidenceRefreshResult = {
  status: 'accepted',
  musicFetch: true,
  dspDiscovery: true,
  surfaces: { status: 'reconciled', surfaces: 6, sources: 6 },
  jobs: {
    musicFetch: { status: 'accepted', jobId: 'music-job' },
    dspDiscovery: { status: 'accepted', jobId: 'dsp-job' },
  },
};

const call = () =>
  POST(new Request('https://jov.ie') as never, {
    params: Promise.resolve({ id: 'lead-1' }),
  });

describe('POST /api/admin/leads/[id]/refresh-evidence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.lead = [
      { id: 'lead-1', spotifyUrl: 'u', creatorProfileId: 'profile-1' },
    ];
    mocks.access.mockResolvedValue({ isAuthenticated: true, isAdmin: true });
    mocks.refresh.mockResolvedValue(accepted);
  });

  it('re-collects evidence for a built lead profile', async () => {
    mocks.lead = [
      { id: 'lead-1', spotifyUrl: 'u', creatorProfileId: 'profile-1' },
    ];
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ...accepted });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.refresh).toHaveBeenCalledWith('profile-1', mocks.lead[0]);
  });

  it('asks for a profile build first, and 404s a missing lead', async () => {
    mocks.lead = [{ id: 'lead-1', spotifyUrl: null, creatorProfileId: null }];
    expect((await call()).status).toBe(409);
    mocks.lead = [];
    expect((await call()).status).toBe(404);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('denies non-admins', async () => {
    mocks.access.mockResolvedValue({ isAuthenticated: true, isAdmin: false });
    expect((await call()).status).toBe(403);
  });
  it.each(['partial', 'failed'] as const)(
    'does not return HTTP success for %s work',
    async status => {
      const result: LeadEvidenceRefreshResult = {
        status,
        musicFetch: false,
        dspDiscovery: status === 'partial',
        surfaces: { status: 'failed' },
        jobs: {
          musicFetch: { status: 'failed', jobId: null },
          dspDiscovery:
            status === 'partial'
              ? { status: 'accepted', jobId: 'dsp-job' }
              : { status: 'failed', jobId: null },
        },
      };
      mocks.refresh.mockResolvedValue(result);
      const response = await call();
      expect(response.status).toBe(status === 'partial' ? 409 : 503);
      expect(response.ok).toBe(false);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(await response.json()).toMatchObject({
        ok: false,
        ...result,
        error: expect.any(String),
      });
    }
  );

  it('reports missing source separately from an accepted enrichment', async () => {
    mocks.refresh.mockResolvedValue({
      ...accepted,
      status: 'no_source',
      musicFetch: false,
      dspDiscovery: false,
      jobs: {
        musicFetch: { status: 'no_source', jobId: null },
        dspDiscovery: { status: 'no_source', jobId: null },
      },
    } satisfies LeadEvidenceRefreshResult);
    const response = await call();
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      status: 'no_source',
      musicFetch: false,
      dspDiscovery: false,
    });
  });

  it('sanitizes unexpected refresh failures', async () => {
    mocks.refresh.mockRejectedValue(new Error('private database detail'));
    const response = await call();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'safe' });
  });
  it('preserves partial queue receipts through the real query fetch adapter', async () => {
    mocks.refresh.mockResolvedValue({
      ...accepted,
      status: 'partial',
      musicFetch: false,
      jobs: { ...accepted.jobs, musicFetch: { status: 'failed', jobId: null } },
    } satisfies LeadEvidenceRefreshResult);
    const response = await call();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    try {
      await expect(
        fetchWithTimeout('/api/admin/leads/lead-1/refresh-evidence', {
          method: 'POST',
        })
      ).rejects.toMatchObject({
        status: 409,
        parsedBody: {
          ok: false,
          status: 'partial',
          musicFetch: false,
          dspDiscovery: true,
          jobs: { dspDiscovery: { status: 'accepted', jobId: 'dsp-job' } },
        },
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
