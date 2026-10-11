import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ principal: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));
vi.mock('@/lib/ovie/inbox.server', () => ({ readOvieInbox: mocks.read }));
const request = () => new Request('https://example.com/api/ovie/inbox');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.principal.mockResolvedValue({ authenticated: true, isAdmin: true });
  mocks.read.mockResolvedValue({ cases: [], issues: [] });
});
describe('Ovie Inbox read access', () => {
  it.each([
    [false, false, 401],
    [true, false, 403],
  ])(
    'denies unauthorized reads before accessing company cases',
    async (authenticated, isAdmin, status) => {
      mocks.principal.mockResolvedValue({ authenticated, isAdmin });
      expect((await GET(request())).status).toBe(status);
      expect(mocks.read).not.toHaveBeenCalled();
    }
  );
  it('returns private uncached projections to an authorized operator', async () => {
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await result.json()).toEqual({ cases: [], issues: [] });
  });
  it('fails closed on unavailable identity or sources', async () => {
    mocks.principal.mockRejectedValueOnce(new Error('identity unavailable'));
    expect((await GET(request())).status).toBe(503);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.read.mockRejectedValueOnce(new Error('source unavailable'));
    expect((await GET(request())).status).toBe(503);
  });
});
