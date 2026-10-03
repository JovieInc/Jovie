import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  limit: vi.fn(),
  submit: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mocks.auth,
}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/queries/shared', () => ({ getUserByClerkId: mocks.user }));
vi.mock('@/lib/integrations/requests', () => ({
  submitIntegrationSignal: mocks.submit,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));
vi.mock('@/lib/rate-limit', () => ({
  generalLimiter: { limit: mocks.limit },
  createRateLimitHeaders: () => ({}),
}));

import { POST } from './route';

const signal = {
  provider: 'New Service',
  capability: 'catalog_links',
  useCase: 'Find my music on this service.',
};
const request = (data: unknown = signal) =>
  new Request('http://localhost/api/integrations/requests', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
  });
describe('integration demand endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      userId: 'auth-user',
      isAuthenticated: true,
    });
    mocks.user.mockResolvedValue({ id: 'database-user' });
    mocks.limit.mockResolvedValue({ success: true });
    mocks.submit.mockResolvedValue({ kind: 'draft', id: 'persisted-id' });
  });
  it('requires authentication before parsing or saving demand', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('limits requests using the authenticated identity', async () => {
    mocks.limit.mockResolvedValue({ success: false });
    expect((await POST(request())).status).toBe(429);
    expect(mocks.limit).toHaveBeenCalledWith('integration-request:auth-user');
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('rejects malformed signals and oversized request bodies', async () => {
    expect((await POST(request({ provider: '../../invalid' }))).status).toBe(
      400
    );
    expect(
      (await POST(request({ ...signal, useCase: 'x'.repeat(5000) }))).status
    ).toBe(413);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it('does not accept caller-supplied tenant identities', async () => {
    expect(
      (await POST(request({ ...signal, userId: 'other-tenant' }))).status
    ).toBe(400);
    mocks.user.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(403);
  });
  it('returns a draft only after persistence using the server-resolved user', async () => {
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ id: 'persisted-id' });
    expect(mocks.submit).toHaveBeenCalledWith('database-user', signal);
  });
  it('returns existing integrations without claiming a new draft', async () => {
    mocks.submit.mockResolvedValue({
      kind: 'existing',
      integrationId: 'spotify',
    });
    expect((await POST(request())).status).toBe(200);
  });
  it('returns a retryable failure on storage errors', async () => {
    mocks.submit.mockRejectedValue(new Error('database offline'));
    expect((await POST(request())).status).toBe(500);
    expect(mocks.capture).toHaveBeenCalled();
  });
});
