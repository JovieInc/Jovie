import { beforeEach, describe, expect, it, vi } from 'vitest';
import HudPage from '@/app/hud/page';

const {
  redirectMock,
  unauthorizedMock,
  forbiddenMock,
  getCurrentAdminPageAccessMock,
  getHudMetricsMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  unauthorizedMock: vi.fn(),
  forbiddenMock: vi.fn(),
  getCurrentAdminPageAccessMock: vi.fn(),
  getHudMetricsMock: vi.fn(),
}));

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
    await expect(
      HudPage({
        searchParams: Promise.resolve({ kiosk: 'test-token' }),
      })
    ).rejects.toThrow('NEXT_REDIRECT:/hud-tv?kiosk=test-token');
    expect(getCurrentAdminPageAccessMock).not.toHaveBeenCalled();
  });

  it('calls unauthorized for signed-out users', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: false,
      hasAdminRole: false,
      userId: null,
    });

    await HudPage({ searchParams: Promise.resolve({}) });

    expect(unauthorizedMock).toHaveBeenCalled();
  });

  it('calls forbidden for signed-in non-admin users', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: true,
      hasAdminRole: false,
      userId: 'user_123',
    });

    await HudPage({ searchParams: Promise.resolve({}) });

    expect(forbiddenMock).toHaveBeenCalled();
  });
});
