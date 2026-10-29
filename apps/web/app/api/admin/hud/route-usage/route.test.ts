import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  entitlements: vi.fn(),
  read: vi.fn(),
  record: vi.fn(),
}));

vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: mocks.entitlements,
}));
vi.mock('@/lib/ovie/route-usage.server', () => ({
  readOvieRouteUsage: mocks.read,
  recordOvieRouteView: mocks.record,
}));

const url = 'https://example.test/api/admin/hud/route-usage';
const post = (body: string) => POST(new Request(url, { method: 'POST', body }));

describe('Ovie route usage access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
    mocks.record.mockResolvedValue(true);
    mocks.read.mockResolvedValue({ measured: true, rows: [] });
  });

  it.each([
    [false, false, 401],
    [true, false, 403],
  ])(
    'denies both methods before storage access (%s, %s)',
    async (isAuthenticated, isAdmin, status) => {
      mocks.entitlements.mockResolvedValue({ isAuthenticated, isAdmin });
      for (const response of [await GET(new Request(url)), await post('{}')]) {
        expect(response.status).toBe(status);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.record).not.toHaveBeenCalled();
    }
  );

  it('uses audited read access for observations and normalizes recorded routes', async () => {
    const response = await post(
      JSON.stringify({ path: '/app/admin/ops?secret=ignored' })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recorded: true });
    expect(mocks.record).toHaveBeenCalledWith('ops');
    expect(mocks.entitlements).toHaveBeenCalledWith({ purpose: 'read' });
  });

  it.each(['not-json', '{}', '{"path":"/outside"}'])(
    'rejects invalid paths without recording (%s)',
    async body => {
      expect((await post(body)).status).toBe(400);
      expect(mocks.record).not.toHaveBeenCalled();
    }
  );

  it('reports unavailable recording without claiming persistence', async () => {
    mocks.record.mockResolvedValue(false);
    const response = await post(JSON.stringify({ path: '/app/admin/ops' }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ recorded: false });
  });

  it.each([
    ['7', 7],
    ['invalid', 30],
  ])('reads the requested finite day range (%s)', async (days, expected) => {
    const response = await GET(new Request(`${url}?days=${days}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ measured: true, rows: [] });
    expect(mocks.read).toHaveBeenCalledWith(expected);
    expect(mocks.entitlements).toHaveBeenCalledWith({ purpose: 'read' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
