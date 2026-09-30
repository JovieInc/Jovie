import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withDbSessionTx: vi.fn(),
  isUnauthorizedSessionError: vi.fn().mockReturnValue(false),
  qualifyProfileSurface: vi.fn(),
  captureError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mocks.withDbSessionTx,
  isUnauthorizedSessionError: mocks.isUnauthorizedSessionError,
}));

vi.mock('@/lib/profile-surfaces/qualification', () => ({
  PROFILE_IDENTITY_DECISIONS: ['yes', 'no', 'unsure'],
  qualifyProfileSurface: mocks.qualifyProfileSurface,
}));

vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.captureError }));

const { POST } = await import('./route');

const SURFACE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '44444444-4444-4444-8444-444444444444';
const TX = { id: 'transaction' };

function request(decision: string) {
  return new Request(
    `http://localhost/api/profile-surfaces/${SURFACE_ID}/qualification`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    }
  );
}

describe('POST /api/profile-surfaces/[id]/qualification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isUnauthorizedSessionError.mockReturnValue(false);
    mocks.withDbSessionTx.mockImplementation(async callback =>
      callback(TX, USER_ID)
    );
    mocks.qualifyProfileSurface.mockResolvedValue({
      ok: true,
      changed: true,
      status: 'rejected',
    });
  });

  it('binds a valid owner answer to the authenticated transaction', async () => {
    const response = await POST(request('no'), {
      params: Promise.resolve({ id: SURFACE_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      changed: true,
      status: 'rejected',
    });
    expect(mocks.qualifyProfileSurface).toHaveBeenCalledWith(TX, {
      surfaceId: SURFACE_ID,
      actorUserId: USER_ID,
      decision: 'no',
    });
  });

  it('rejects an invalid answer without mutating the identity graph', async () => {
    const response = await POST(request('probably'), {
      params: Promise.resolve({ id: SURFACE_ID }),
    });

    expect(response.status).toBe(400);
    expect(mocks.qualifyProfileSurface).not.toHaveBeenCalled();
  });

  it('returns conflict when the surface changed before the answer committed', async () => {
    mocks.qualifyProfileSurface.mockResolvedValue({
      ok: false,
      reason: 'stale',
    });

    const response = await POST(request('yes'), {
      params: Promise.resolve({ id: SURFACE_ID }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, error: 'stale' });
  });
});
