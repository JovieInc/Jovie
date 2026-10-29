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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.entitlements.mockResolvedValue({
    isAuthenticated: true,
    isAdmin: true,
  });
  mocks.record.mockResolvedValue(true);
  mocks.read.mockResolvedValue([]);
});

describe('Ovie route usage access', () => {
  for (const handler of [GET, POST]) {
    it(`denies anonymous and non-admin ${handler.name} before accessing usage`, async () => {
      mocks.entitlements.mockResolvedValue({
        isAuthenticated: false,
        isAdmin: false,
      });
      expect(
        (
          await handler(
            new Request('https://example.com/api/admin/hud/route-usage')
          )
        ).status
      ).toBe(401);
      mocks.entitlements.mockResolvedValue({
        isAuthenticated: true,
        isAdmin: false,
      });
      expect(
        (
          await handler(
            new Request('https://example.com/api/admin/hud/route-usage')
          )
        ).status
      ).toBe(403);
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.record).not.toHaveBeenCalled();
    });
  }

  it('records a canonical route template with the audited observation scope', async () => {
    const response = await POST(
      new Request('https://example.com/api/admin/hud/route-usage', {
        method: 'POST',
        body: JSON.stringify({ path: '/app/ov?secret=discarded' }),
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recorded: true });
    expect(mocks.entitlements).toHaveBeenCalledWith({ purpose: 'read' });
    expect(mocks.record).toHaveBeenCalledWith('home');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects malformed and non-Ovie paths without recording usage', async () => {
    for (const body of ['invalid', JSON.stringify({ path: '/outside' })]) {
      expect(
        (
          await POST(
            new Request('https://example.com/api/admin/hud/route-usage', {
              method: 'POST',
              body,
            })
          )
        ).status
      ).toBe(400);
    }
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('reports an unavailable usage write as accepted rather than recorded', async () => {
    mocks.record.mockResolvedValue(false);
    const response = await POST(
      new Request('https://example.com/api/admin/hud/route-usage', {
        method: 'POST',
        body: JSON.stringify({ path: '/app/ov' }),
      })
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ recorded: false });
  });

  it('falls back to the default read window for an invalid number', async () => {
    const response = await GET(
      new Request('https://example.com/api/admin/hud/route-usage?days=invalid')
    );
    expect(mocks.read).toHaveBeenCalledWith(30);
    expect(response.status).toBe(200);
  });
});
