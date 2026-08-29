import { beforeEach, describe, expect, it, vi } from 'vitest';
import HudPage from '@/app/hud/page';
import { APP_ROUTES } from '@/constants/routes';

const {
  redirectMock,
  unauthorizedMock,
  forbiddenMock,
  authorizeHudMock,
  getCurrentAdminPageAccessMock,
  getHudMetricsMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  unauthorizedMock: vi.fn(() => {
    throw new Error('NEXT_UNAUTHORIZED');
  }),
  forbiddenMock: vi.fn(() => {
    throw new Error('NEXT_FORBIDDEN');
  }),
  authorizeHudMock: vi.fn(),
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
vi.mock('@/lib/auth/hud', () => ({ authorizeHud: authorizeHudMock }));
vi.mock('@/lib/hud/metrics', () => ({ getHudMetrics: getHudMetricsMock }));
vi.mock('@/lib/hud/source-trust', () => ({
  isHudMetricValueAvailable: () => false,
}));
vi.mock('@/lib/env-server', () => ({
  env: { HUD_AGENT_RUNS_FIXTURES: '0' },
}));

type ReactElementLike = {
  readonly type: unknown;
  readonly props?: {
    readonly children?: unknown;
    readonly [key: string]: unknown;
  };
};

function findElementByName(
  node: unknown,
  name: string
): ReactElementLike | null {
  if (!node || typeof node !== 'object') return null;
  const element = node as ReactElementLike;
  const type = element.type as { name?: string } | string | undefined;
  const typeName = typeof type === 'string' ? type : type?.name;
  if (typeName === name) return element;

  const children = element.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElementByName(child, name);
      if (found) return found;
    }
    return null;
  }
  return findElementByName(children, name);
}

describe('/hud kiosk and compatibility boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeHudMock.mockResolvedValue({ ok: false, reason: 'unauthorized' });
  });

  it('renders only the token-authenticated kiosk at the standalone route', async () => {
    authorizeHudMock.mockResolvedValue({ ok: true, mode: 'kiosk' });
    const metrics = { accessMode: 'kiosk' as const, generatedAt: 'now' };
    getHudMetricsMock.mockResolvedValue(metrics);

    const result = await HudPage({
      searchParams: Promise.resolve({ kiosk: 'test-token' }),
    });

    expect(authorizeHudMock).toHaveBeenCalledWith('test-token');
    expect(getCurrentAdminPageAccessMock).not.toHaveBeenCalled();
    expect(getHudMetricsMock).toHaveBeenCalledWith('kiosk');
    const dashboard = findElementByName(result, 'HudDashboardClient');
    expect(dashboard?.props).toMatchObject({
      initialMetrics: metrics,
      density: 'kiosk',
      presentationMode: 'token',
      kioskToken: 'test-token',
    });
  });

  it('redirects ordinary signed-in Ops into the app shell before loading data', async () => {
    await expect(
      HudPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow(`NEXT_REDIRECT:${APP_ROUTES.ADMIN_OPS}`);

    expect(authorizeHudMock).not.toHaveBeenCalled();
    expect(getCurrentAdminPageAccessMock).not.toHaveBeenCalled();
    expect(getHudMetricsMock).not.toHaveBeenCalled();
  });

  it('preserves packaged Ovie and fullscreen presentation inputs on the in-shell redirect', async () => {
    await expect(
      HudPage({
        searchParams: Promise.resolve({
          ovie: 'mac',
          runtime: 'electron',
          ovie_refresh: '123',
          fs: '1',
        }),
      })
    ).rejects.toThrow(
      `NEXT_REDIRECT:${APP_ROUTES.ADMIN_OPS}?ovie=mac&runtime=electron&ovie_refresh=123&fs=1`
    );
    expect(getHudMetricsMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid kiosk token for signed-out users', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: false,
      hasAdminRole: false,
    });

    await expect(
      HudPage({ searchParams: Promise.resolve({ kiosk: 'wrong' }) })
    ).rejects.toThrow('NEXT_UNAUTHORIZED');
    expect(getHudMetricsMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid kiosk token for non-admin users', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: true,
      hasAdminRole: false,
    });

    await expect(
      HudPage({ searchParams: Promise.resolve({ kiosk: 'wrong' }) })
    ).rejects.toThrow('NEXT_FORBIDDEN');
    expect(getHudMetricsMock).not.toHaveBeenCalled();
  });

  it('contains an invalid kiosk handoff for admins by returning to in-shell fullscreen', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: true,
      hasAdminRole: true,
    });

    await expect(
      HudPage({ searchParams: Promise.resolve({ kiosk: 'expired' }) })
    ).rejects.toThrow(`NEXT_REDIRECT:${APP_ROUTES.ADMIN_OPS}?fs=1`);
    expect(getHudMetricsMock).not.toHaveBeenCalled();
  });
});
