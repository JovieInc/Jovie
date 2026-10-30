import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  parity: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));
vi.mock('@/lib/music-resolver/resolve-parity.server', () => ({
  readShadowParitySummary: mocks.parity,
}));
vi.mock('@/lib/music-resolver/musicfetch-gate', () => ({
  musicResolverCutoverReceipt: () => ({
    schema: 'jovie.music-resolver-cutover/v1',
  }),
}));

const request = () => new Request('https://jov.ie/api/ovie/music-resolver');

describe('GET /api/ovie/music-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principal.mockResolvedValue({ authenticated: true, isAdmin: true });
    mocks.parity.mockResolvedValue({
      receipts: 6,
      falseLinkAlarm: { firing: false },
    });
  });

  it('returns parity and cutover state to admins', async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.schema).toBe('jovie.music-resolver-quality/v1');
    expect(body.parity.receipts).toBe(6);
    expect(body.cutover.schema).toBe('jovie.music-resolver-cutover/v1');
  });

  it('rejects non-admins and anonymous callers', async () => {
    mocks.principal.mockResolvedValueOnce({
      authenticated: true,
      isAdmin: false,
    });
    expect((await GET(request())).status).toBe(403);
    mocks.principal.mockResolvedValueOnce({
      authenticated: false,
      isAdmin: false,
    });
    expect((await GET(request())).status).toBe(401);
    expect(mocks.parity).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when a store is unreadable', async () => {
    mocks.parity.mockRejectedValueOnce(new Error('db down'));
    expect((await GET(request())).status).toBe(503);
    mocks.principal.mockRejectedValueOnce(new Error('auth down'));
    expect((await GET(request())).status).toBe(503);
  });
});
