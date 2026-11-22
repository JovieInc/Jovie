import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getCachedCurrentUser: vi.fn(),
  limit: vi.fn(),
  trackServerEvent: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
  getCachedCurrentUser: mocks.getCachedCurrentUser,
}));
vi.mock('@/lib/rate-limit', () => ({
  navigationTelemetryLimiter: { limit: mocks.limit },
}));
vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mocks.trackServerEvent,
}));

import { POST } from './route';

const VALID = {
  durationMs: 1_840,
  serverMs: 220,
  documentMs: 610,
  bootMs: 540,
  settleMs: 470,
  outcome: 'reached',
  newAccount: true,
};

function post(body: unknown): Request {
  return new Request('https://jov.ie/api/dashboard/first-ready', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/dashboard/first-ready', () => {
  beforeEach(() => {
    mocks.getCachedAuth.mockReset().mockResolvedValue({ userId: 'user_1' });
    mocks.getCachedCurrentUser.mockReset().mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'artist@gmail.com' },
    });
    mocks.limit.mockReset().mockResolvedValue({ success: true });
    mocks.trackServerEvent.mockReset().mockResolvedValue(undefined);
  });

  it('rejects signed-out callers', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: null });
    const response = await POST(post(VALID));
    expect(response.status).toBe(401);
    expect(mocks.trackServerEvent).not.toHaveBeenCalled();
  });

  it('acknowledges and drops a rate-limited sample', async () => {
    mocks.limit.mockResolvedValue({ success: false });
    const response = await POST(post(VALID));
    expect(response.status).toBe(204);
    expect(mocks.trackServerEvent).not.toHaveBeenCalled();
  });

  it('rejects payloads outside the contract', async () => {
    for (const body of [
      { ...VALID, durationMs: -1 },
      { ...VALID, durationMs: 1.5 },
      { ...VALID, durationMs: 99_999 },
      { ...VALID, outcome: 'maybe' },
      { ...VALID, userId: 'user_1' },
    ]) {
      const response = await POST(post(body));
      expect(response.status).toBe(400);
    }
    expect(mocks.trackServerEvent).not.toHaveBeenCalled();
  });

  it('stores the sample with its phases and the account cohort', async () => {
    const response = await POST(post(VALID));
    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.limit).toHaveBeenCalledWith('first-dashboard:user_1');
    expect(mocks.trackServerEvent).toHaveBeenCalledWith(
      'first_dashboard_ready',
      {
        duration_ms: 1_840,
        server_ms: 220,
        document_ms: 610,
        boot_ms: 540,
        settle_ms: 470,
        outcome: 'reached',
        new_account: true,
        cohort: 'customer',
      }
    );
  });

  it('marks an unknown account as unattributed rather than failing', async () => {
    mocks.getCachedCurrentUser.mockRejectedValue(new Error('clerk down'));
    const response = await POST(post({ ...VALID, outcome: 'dropped' }));
    expect(response.status).toBe(204);
    expect(mocks.trackServerEvent.mock.calls[0]?.[1]).toMatchObject({
      outcome: 'dropped',
      cohort: 'unattributed',
    });
  });
});
