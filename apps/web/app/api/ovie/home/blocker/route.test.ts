import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  read: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));
vi.mock('@/lib/ovie/company-state.server', () => ({
  readCompanyStateCache: mocks.read,
}));

const request = () => new Request('https://jov.ie/api/ovie/home/blocker');

const blocker = {
  schema: 'jovie.company-blocker/v1',
  id: 'certification:public_profile',
  kind: 'certification',
  step: 'public_profile',
  tone: 'bad',
  text: 'The public profile fails certification, so no artist can be sent their profile yet',
  detailsHref: '/app/ov/certifications',
  since: null,
  nextAction: null,
  observedAt: '2026-11-08T23:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.principal.mockResolvedValue({ authenticated: true, isAdmin: true });
  mocks.read.mockResolvedValue({
    snapshot: { generatedAt: '2026-11-08T23:00:00.000Z' },
    answer: { blocker },
  });
});

describe('GET /api/ovie/home/blocker', () => {
  it.each([
    [false, false, 401],
    [true, false, 403],
  ])(
    'rejects authenticated=%s admin=%s with %s',
    async (authenticated, isAdmin, status) => {
      mocks.principal.mockResolvedValue({ authenticated, isAdmin });
      const response = await GET(request());
      expect(response.status).toBe(status);
      expect(mocks.read).not.toHaveBeenCalled();
    }
  );

  it('returns the cached blocker without counting a cache read', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      blocker,
      generatedAt: '2026-11-08T23:00:00.000Z',
    });
    expect(mocks.read).toHaveBeenCalledWith({ track: false });
  });

  it('is unavailable, never clear, when no snapshot is cached', async () => {
    mocks.read.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(503);
  });

  it('is unavailable when the cache read throws', async () => {
    mocks.read.mockRejectedValue(new Error('redis down'));
    expect((await GET(request())).status).toBe(503);
  });
});
