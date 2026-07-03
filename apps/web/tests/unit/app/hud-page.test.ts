import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn();
const unauthorizedMock = vi.fn();
const forbiddenMock = vi.fn();
const getCurrentAdminPageAccessMock = vi.fn();
const getHudMetricsMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  unauthorized: unauthorizedMock,
  forbidden: forbiddenMock,
}));

vi.mock('@/lib/admin/page-access', () => ({
  getCurrentAdminPageAccess: getCurrentAdminPageAccessMock,
}));

vi.mock('@/lib/hud/metrics', () => ({
  getHudMetrics: getHudMetricsMock,
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    HUD_AGENT_RUNS_FIXTURES: '0',
  },
}));

describe('/hud page auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHudMetricsMock.mockResolvedValue({ accessMode: 'admin' });
  });

  it('redirects kiosk bookmarks to /hud-tv', async () => {
    const { default: HudPage } = await import('@/app/hud/page');
    await HudPage({
      searchParams: Promise.resolve({ kiosk: 'test-token' }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/hud-tv?kiosk=test-token');
  });

  it('calls unauthorized for signed-out users', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: false,
      hasAdminRole: false,
      userId: null,
    });

    const { default: HudPage } = await import('@/app/hud/page');
    await HudPage({ searchParams: Promise.resolve({}) });

    expect(unauthorizedMock).toHaveBeenCalled();
  });

  it('calls forbidden for signed-in non-admin users', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: true,
      hasAdminRole: false,
      userId: 'user_123',
    });

    const { default: HudPage } = await import('@/app/hud/page');
    await HudPage({ searchParams: Promise.resolve({}) });

    expect(forbiddenMock).toHaveBeenCalled();
  });
});