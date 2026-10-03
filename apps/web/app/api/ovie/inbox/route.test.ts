import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  inbox: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));
vi.mock('@/lib/ovie/inbox.server', () => ({
  buildOvieInbox: mocks.inbox,
}));

const request = () => new Request('https://jov.ie/api/ovie/inbox');

describe('GET /api/ovie/inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principal.mockResolvedValue({ authenticated: true, isAdmin: true });
  });

  it('rejects unauthenticated and non-admin callers before reading cards', async () => {
    mocks.principal.mockResolvedValueOnce({
      authenticated: false,
      isAdmin: false,
    });
    expect((await GET(request())).status).toBe(401);
    mocks.principal.mockResolvedValueOnce({
      authenticated: true,
      isAdmin: false,
    });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.inbox).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the principal cannot be resolved', async () => {
    mocks.principal.mockRejectedValueOnce(new Error('auth down'));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(mocks.inbox).not.toHaveBeenCalled();
  });

  it('returns the inbox uncached for admins', async () => {
    const inbox = {
      pending: [],
      decided: [],
      sources: { summer: 'ok', 'design-lab': 'ok' },
      fetchedAt: '2026-09-27T00:00:00.000Z',
    };
    mocks.inbox.mockResolvedValueOnce(inbox);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual(inbox);
  });
});
