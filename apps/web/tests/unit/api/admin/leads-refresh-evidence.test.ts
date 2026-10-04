import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const call = () =>
  POST(new Request('https://jov.ie') as never, {
    params: Promise.resolve({ id: 'lead-1' }),
  });

describe('POST /api/admin/leads/[id]/refresh-evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ isAuthenticated: true, isAdmin: true });
    mocks.refresh.mockResolvedValue({ musicFetch: true, dspDiscovery: true });
  });

  it('re-collects evidence for a built lead profile', async () => {
    mocks.lead = [
      { id: 'lead-1', spotifyUrl: 'u', creatorProfileId: 'profile-1' },
    ];
    const response = await call();
    expect(response.status).toBe(200);
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
});
