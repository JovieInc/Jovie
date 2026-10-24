import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  isEarlyAccess: vi.fn(),
  setEarlyAccess: vi.fn(),
  limit: vi.fn(),
  getAppUserById: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({ getFreshAuth: mocks.auth }));
vi.mock('@/lib/auth/app-user', () => ({
  getAppUserById: mocks.getAppUserById,
}));
vi.mock('@/lib/early-access/server', () => ({
  earlyAccessToggleLimiter: { limit: mocks.limit },
  isEarlyAccess: mocks.isEarlyAccess,
  setEarlyAccess: mocks.setEarlyAccess,
}));

import { GET, POST } from './route';

const request = (body: unknown, origin = 'https://jov.ie') =>
  new Request('https://jov.ie/api/account/early-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(body),
  });

describe('early-access settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1', sessionId: 'session-1' });
    mocks.isEarlyAccess.mockResolvedValue(true);
    mocks.limit.mockResolvedValue({ success: true, unavailable: false });
    mocks.getAppUserById.mockResolvedValue({
      name: 'Ada',
      email: 'ada@example.com',
    });
    mocks.setEarlyAccess.mockResolvedValue(true);
  });

  it('reads eligibility only for the authenticated account', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
    expect(mocks.isEarlyAccess).toHaveBeenCalledWith({ id: 'user-1' });
  });

  it('requires authentication', async () => {
    mocks.auth.mockResolvedValue({ userId: null, sessionId: null });
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ enabled: true }))).status).toBe(401);
  });

  it('rejects invalid origin and invalid payload before mutation', async () => {
    expect(
      (await POST(request({ enabled: true }, 'https://evil.test'))).status
    ).toBe(403);
    expect((await POST(request({ enabled: 'yes' }))).status).toBe(400);
    expect(mocks.setEarlyAccess).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
  });

  it('enforces the per-account daily cap', async () => {
    mocks.limit.mockResolvedValue({ success: false, unavailable: false });
    const response = await POST(request({ enabled: true }));
    expect(response.status).toBe(429);
    expect(mocks.limit).toHaveBeenCalledWith('user-1');
    expect(mocks.setEarlyAccess).not.toHaveBeenCalled();
  });

  it('writes the requested state with the authenticated account identity', async () => {
    const response = await POST(request({ enabled: true }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true });
    expect(mocks.setEarlyAccess).toHaveBeenCalledWith('user-1', true, 'Ada');
  });
});
