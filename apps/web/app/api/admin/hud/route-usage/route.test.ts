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
    const read = await GET(new Request(`${url}?days=7`));
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ measured: true, rows: [] });
    expect(mocks.read).toHaveBeenCalledWith(7);
    expect(mocks.entitlements).toHaveBeenCalledWith({ purpose: 'read' });
  });
});
