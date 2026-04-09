import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCaptureError,
  mockCaptureWarning,
  mockGetAuthenticatedProfile,
  mockLoggerError,
  mockWithDbSessionTx,
} = vi.hoisted(() => ({
  mockCaptureError: vi.fn(),
  mockCaptureWarning: vi.fn(),
  mockGetAuthenticatedProfile: vi.fn(),
  mockLoggerError: vi.fn(),
  mockWithDbSessionTx: vi.fn(),
}));

vi.mock('@/lib/auth/session', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/auth/session')>(
      '@/lib/auth/session'
    );

  return {
    ...actual,
    withDbSessionTx: mockWithDbSessionTx,
  };
});

vi.mock('@/lib/db/queries/shared', () => ({
  getAuthenticatedProfile: mockGetAuthenticatedProfile,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: mockCaptureWarning,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: mockLoggerError,
  },
}));

function createDbInsertChain() {
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

function createTransactionWithInsert(insert = createDbInsertChain().insert) {
  return {
    insert,
  } as never;
}

describe('POST /api/onboarding/distribution-event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedProfile.mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000',
    });
  });

  it('returns 404 when the authenticated user does not own the profile', async () => {
    mockGetAuthenticatedProfile.mockResolvedValueOnce(null);
    mockWithDbSessionTx.mockImplementationOnce(async callback =>
      callback(createTransactionWithInsert(), 'user_123')
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
  });

  it('writes a deduped creator distribution event for valid payloads', async () => {
    const dbInsertChain = createDbInsertChain();
    mockWithDbSessionTx.mockImplementationOnce(async callback =>
      callback(createTransactionWithInsert(dbInsertChain.insert), 'user_123')
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
    expect(dbInsertChain.insert).toHaveBeenCalledTimes(1);
    expect(dbInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorProfileId: '123e4567-e89b-12d3-a456-426614174000',
        dedupeKey: 'instagram:link_copied:123e4567-e89b-12d3-a456-426614174000',
        eventType: 'link_copied',
        metadata: { surface: 'onboarding' },
        platform: 'instagram',
      })
    );
    expect(dbInsertChain.onConflictDoNothing).toHaveBeenCalledTimes(1);
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
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it('gracefully skips writes when the distribution events table is not available yet', async () => {
    const dbInsertChain = createDbInsertChain();
    const missingTableError = new Error('Failed query');
    Object.assign(missingTableError, {
      cause: {
        code: '42P01',
        message: 'undefined table',
      },
    });
    dbInsertChain.onConflictDoNothing.mockRejectedValueOnce(missingTableError);
    mockWithDbSessionTx.mockImplementationOnce(async callback =>
      callback(createTransactionWithInsert(dbInsertChain.insert), 'user_123')
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

  it('logs and captures unexpected failures as 500s', async () => {
    const dbInsertChain = createDbInsertChain();
    const insertError = new Error('boom');
    dbInsertChain.onConflictDoNothing.mockRejectedValueOnce(insertError);
    mockWithDbSessionTx.mockImplementationOnce(async callback =>
      callback(createTransactionWithInsert(dbInsertChain.insert), 'user_123')
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

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal server error',
    });
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[onboarding/distribution-event] Failed to record creator distribution event',
      insertError
    );
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Error recording creator distribution event',
      insertError,
      { route: '/api/onboarding/distribution-event' }
    );
  });
});
