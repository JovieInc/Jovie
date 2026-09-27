import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  list: vi.fn(),
  captureError: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: hoisted.resolvePrincipal,
}));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  listSummerCards: hoisted.list,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

const { GET } = await import('@/app/api/ovie/summer-cards/route');

const admin = {
  authenticated: true,
  isAdmin: true,
  subject: 'user-1',
  email: 'founder@jov.ie',
  scopes: [],
};

function call(url = 'https://jov.ie/api/ovie/summer-cards') {
  return GET(new Request(url));
}

describe('GET /api/ovie/summer-cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.resolvePrincipal.mockResolvedValue(admin);
    hoisted.list.mockResolvedValue([]);
  });

  it('returns 401 for an unauthenticated caller', async () => {
    hoisted.resolvePrincipal.mockResolvedValue({
      authenticated: false,
      isAdmin: false,
      scopes: [],
    });
    const response = await call();
    expect(response.status).toBe(401);
    expect(hoisted.list).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin', async () => {
    hoisted.resolvePrincipal.mockResolvedValue({ ...admin, isAdmin: false });
    const response = await call();
    expect(response.status).toBe(403);
    expect(hoisted.list).not.toHaveBeenCalled();
  });

  it('lists pending cards by default with a pending count', async () => {
    const card = {
      id: 'sc_0123456789abcdef0123456789abcdef',
      status: 'pending',
    };
    hoisted.list.mockResolvedValue([card]);

    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      cards: [card],
      pendingCount: 1,
    });
    expect(hoisted.list).toHaveBeenCalledWith({ status: 'pending', limit: 50 });
  });

  it('passes through status and limit filters', async () => {
    const response = await call(
      'https://jov.ie/api/ovie/summer-cards?status=all&limit=10'
    );
    expect(response.status).toBe(200);
    expect(hoisted.list).toHaveBeenCalledWith({
      status: 'all',
      limit: 10,
      since: undefined,
    });
  });

  it('rejects an invalid status filter with 400', async () => {
    const response = await call(
      'https://jov.ie/api/ovie/summer-cards?status=bogus'
    );
    expect(response.status).toBe(400);
    expect(hoisted.list).not.toHaveBeenCalled();
  });

  it('returns 503 when the store fails', async () => {
    hoisted.list.mockRejectedValue(new Error('db down'));
    const response = await call();
    expect(response.status).toBe(503);
    expect(hoisted.captureError).toHaveBeenCalled();
  });
});
