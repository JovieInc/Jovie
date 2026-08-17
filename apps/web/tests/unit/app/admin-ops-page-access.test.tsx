import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeHudMock,
  getCurrentAdminPageAccessMock,
  getHudMetricsMock,
  unauthorizedMock,
  forbiddenMock,
} = vi.hoisted(() => ({
  authorizeHudMock: vi.fn(),
  getCurrentAdminPageAccessMock: vi.fn(),
  getHudMetricsMock: vi.fn(),
  unauthorizedMock: vi.fn(() => {
    throw new Error('NEXT_UNAUTHORIZED');
  }),
  forbiddenMock: vi.fn(() => {
    throw new Error('NEXT_FORBIDDEN');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  unauthorized: unauthorizedMock,
  forbidden: forbiddenMock,
}));
vi.mock('@/lib/admin/page-access', () => ({
  getCurrentAdminPageAccess: getCurrentAdminPageAccessMock,
}));
vi.mock('@/lib/auth/hud', () => ({
  authorizeHud: authorizeHudMock,
}));
vi.mock('@/lib/hud/metrics', () => ({ getHudMetrics: getHudMetricsMock }));
vi.mock('@/lib/env-server', () => ({ env: { HUD_AGENT_RUNS_FIXTURES: '0' } }));
vi.mock('@/lib/hud/source-trust', () => ({
  isHudMetricValueAvailable: () => false,
}));
vi.mock('@/components/features/admin/hud/FounderMorningWalkCard', () => ({
  FounderMorningWalkCard: () => null,
}));
vi.mock('@/components/features/admin/hud/HudFullscreenControl', () => ({
  HudFullscreenControl: () => null,
}));
vi.mock('@/components/features/admin/hud/HudShipperPanels', () => ({
  HudShipperPanels: () => null,
}));
vi.mock('@/components/features/admin/OperationalControlPanel', () => ({
  OperationalControlPanel: () => null,
}));
vi.mock('@/app/app/(shell)/admin/ops/HudDashboardClient', () => ({
  HudDashboardClient: () => null,
}));
vi.mock('@/components/features/admin/layout/AdminPage', () => ({
  AdminPage: ({ children }: { children: unknown }) => children,
}));
vi.mock('@/components/organisms/StandaloneProductPage', () => ({
  StandaloneProductPage: ({ children }: { children: unknown }) => children,
}));

import HudPage from '@/app/hud/page';

describe('HudPage access boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeHudMock.mockResolvedValue({ ok: false, reason: 'unauthorized' });
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: false,
      hasAdminRole: false,
    });
  });

  it('starts no admin data work before a non-admin is rejected', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(
      HudPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_UNAUTHORIZED');

    expect(getHudMetricsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
