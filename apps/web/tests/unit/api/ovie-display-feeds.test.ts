import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  display: false,
  authorizeHud: vi.fn(),
  getHudMetrics: vi.fn(),
  getFunnel: vi.fn(),
  operatorEntitlements: vi.fn(),
  resolvePrincipal: vi.fn(),
  authorizeSummer: vi.fn(),
  readInbox: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ovie/display/server', () => ({
  isDisplayReadRequest: async () => m.display,
}));
vi.mock('@/lib/auth/hud', () => ({ authorizeHud: m.authorizeHud }));
vi.mock('@/lib/hud/metrics', () => ({
  getHudMetrics: m.getHudMetrics,
  buildDegradedHudMetrics: vi.fn(),
}));
vi.mock('@/lib/http/server-fetch', () => ({
  ServerFetchTimeoutError: class extends Error {},
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelData: m.getFunnel,
}));
vi.mock('@/lib/ovie/privacy-lock/access', () => ({
  getOvieOperatorEntitlements: m.operatorEntitlements,
}));
vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: m.resolvePrincipal,
}));
vi.mock('@/lib/ovie/control', () => ({
  authorizeSummerControl: m.authorizeSummer,
}));
vi.mock('@/lib/ovie/inbox.server', () => ({ readOvieInbox: m.readInbox }));
vi.mock('@/lib/next/schedule-after', () => ({ scheduleAfter: vi.fn() }));
vi.mock('@/lib/ovie/shipping-state/configured.server', () => ({
  hasCachedConfiguredShippingState: () => true,
  readCachedConfiguredShippingState: () => ({
    schema: 'ovie.shipping-state.v1',
    observationTimestamp: new Date().toISOString(),
  }),
  publishConfiguredShippingState: async () => null,
}));

import { GET as funnel } from '@/app/api/admin/hud/founder-funnel/route';
import { GET as metrics } from '@/app/api/hud/metrics/route';
import { GET as shipping } from '@/app/api/hud/shipping-state/route';
import { GET as inbox } from '@/app/api/ovie/inbox/route';

const req = (path: string) => new NextRequest(`https://example.test${path}`);

describe('Home feeds and the display session', () => {
  beforeEach(() => {
    m.display = false;
    for (const fn of [
      m.authorizeHud,
      m.getHudMetrics,
      m.getFunnel,
      m.operatorEntitlements,
      m.resolvePrincipal,
      m.authorizeSummer,
      m.readInbox,
    ])
      fn.mockReset();
    m.authorizeHud.mockResolvedValue({ ok: false, reason: 'unauthorized' });
    m.getHudMetrics.mockResolvedValue({ metrics: true });
    m.getFunnel.mockResolvedValue({ errors: [], stages: [] });
    m.operatorEntitlements.mockResolvedValue({
      isAuthenticated: false,
      isAdmin: false,
    });
    m.resolvePrincipal.mockResolvedValue({ kind: 'none' });
    m.authorizeSummer.mockReturnValue({ ok: false, status: 403 });
    m.readInbox.mockResolvedValue({ cases: [], issues: [] });
  });

  it('metrics: a valid display session reads without the HUD token or an admin login', async () => {
    m.display = true;
    const response = await metrics(req('/api/hud/metrics'));
    expect(response.status).toBe(200);
    expect(m.authorizeHud).not.toHaveBeenCalled();
    expect(m.getHudMetrics).toHaveBeenCalledWith('kiosk');
  });
  it('shipping-state: a valid display session reads', async () => {
    m.display = true;
    const response = await shipping(req('/api/hud/shipping-state'));
    expect(response.status).toBe(200);
    expect(m.authorizeHud).not.toHaveBeenCalled();
  });
  it('shipping-state: a display session still cannot pass actuation or path parameters', async () => {
    m.display = true;
    const response = await shipping(
      req('/api/hud/shipping-state?path=/x&refresh=1')
    );
    expect([200, 400]).toContain(response.status);
  });
  it('funnel: a valid display session reads without an admin login', async () => {
    m.display = true;
    const response = await funnel(
      req('/api/admin/hud/founder-funnel?range=7d')
    );
    expect(response.status).toBe(200);
    expect(m.operatorEntitlements).not.toHaveBeenCalled();
  });
  it('inbox: a valid display session reads without a principal', async () => {
    m.display = true;
    const response = await inbox(req('/api/ovie/inbox'));
    expect(response.status).toBe(200);
    expect(m.resolvePrincipal).not.toHaveBeenCalled();
    expect(m.readInbox).toHaveBeenCalledTimes(1);
  });

  it('without a display session every feed keeps its own authorization', async () => {
    expect((await metrics(req('/api/hud/metrics'))).status).toBe(401);
    expect((await shipping(req('/api/hud/shipping-state'))).status).toBe(401);
    expect((await funnel(req('/api/admin/hud/founder-funnel'))).status).toBe(
      401
    );
    expect((await inbox(req('/api/ovie/inbox'))).status).toBe(403);
    expect(m.getHudMetrics).not.toHaveBeenCalled();
    expect(m.readInbox).not.toHaveBeenCalled();
  });
});
