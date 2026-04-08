import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockCaptureWarning,
  mockGetAuthenticatedProfile,
  mockWithDbSessionTx,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockCaptureWarning: vi.fn(),
  mockGetAuthenticatedProfile: vi.fn(),
  mockWithDbSessionTx: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  withDbSessionTx: mockWithDbSessionTx,
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getAuthenticatedProfile: mockGetAuthenticatedProfile,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: mockCaptureWarning,
}));

function createTransaction() {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn(() => ({
    onConflictDoNothing,
  }));
  const insert = vi.fn(() => ({
    values,
  }));

  return {
    insert,
    onConflictDoNothing,
    values,
  };
}

describe('POST /api/onboarding/distribution-event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedProfile.mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it('returns 404 when the authenticated user does not own the profile', async () => {
    const tx = createTransaction();
    mockGetAuthenticatedProfile.mockResolvedValueOnce(null);
    mockWithDbSessionTx.mockImplementationOnce(async callback =>
      callback(tx, 'user_123')
    );

    const { POST } = await import(
      '@/app/api/onboarding/distribution-event/route'
    );
    const response = await POST(
      new Request('http://localhost/api/onboarding/distribution-event', {
        body: JSON.stringify({
          eventType: 'link_copied',
          platform: 'instagram',
          profileId: '123e4567-e89b-12d3-a456-426614174000',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Profile not found',
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('writes a deduped creator distribution event for valid payloads', async () => {
    const tx = createTransaction();
    mockWithDbSessionTx.mockImplementationOnce(async callback =>
      callback(tx, 'user_123')
    );

    const { POST } = await import(
      '@/app/api/onboarding/distribution-event/route'
    );
    const response = await POST(
      new Request('http://localhost/api/onboarding/distribution-event', {
        body: JSON.stringify({
          eventType: 'link_copied',
          metadata: { surface: 'onboarding' },
          platform: 'instagram',
          profileId: '123e4567-e89b-12d3-a456-426614174000',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(200);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(tx.values).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: '123e4567-e89b-12d3-a456-426614174000',
        dedupeKey: 'instagram:link_copied:123e4567-e89b-12d3-a456-426614174000',
        eventType: 'link_copied',
        metadata: { surface: 'onboarding' },
        platform: 'instagram',
      })
    );
    expect(tx.onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when auth is missing', async () => {
    mockWithDbSessionTx.mockRejectedValueOnce(new Error('Unauthorized'));

    const { POST } = await import(
      '@/app/api/onboarding/distribution-event/route'
    );
    const response = await POST(
      new Request('http://localhost/api/onboarding/distribution-event', {
        body: JSON.stringify({
          eventType: 'link_copied',
          platform: 'instagram',
          profileId: '123e4567-e89b-12d3-a456-426614174000',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    });
  });

  it('gracefully skips writes when the distribution events table is not available yet', async () => {
    const tx = createTransaction();
    tx.onConflictDoNothing.mockRejectedValueOnce(
      new Error('relation "creator_distribution_events" does not exist')
    );
    mockWithDbSessionTx.mockImplementationOnce(async callback =>
      callback(tx, 'user_123')
    );

    const { POST } = await import(
      '@/app/api/onboarding/distribution-event/route'
    );
    const response = await POST(
      new Request('http://localhost/api/onboarding/distribution-event', {
        body: JSON.stringify({
          eventType: 'link_copied',
          platform: 'instagram',
          profileId: '123e4567-e89b-12d3-a456-426614174000',
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      skipped: 'missing_table',
    });
    expect(mockCaptureWarning).toHaveBeenCalledWith(
      '[onboarding/distribution-event] creator_distribution_events table missing; skipping event write',
      expect.any(Error),
      expect.objectContaining({
        eventType: 'link_copied',
        platform: 'instagram',
      })
    );
  });
});
