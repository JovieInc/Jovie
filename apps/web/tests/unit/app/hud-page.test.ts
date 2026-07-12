import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  // Real next/navigation `unauthorized()`/`forbidden()` always throw (they
  // never return to the caller) -- mirror that here so a mutation that lets
  // execution continue past the gate (e.g. `getHudMetrics` firing before or
  // regardless of the gate check) fails the suite instead of silently
  // passing, the same way `redirectMock` above already does for `redirect()`.
  unauthorizedMock: vi.fn(() => {
    throw new Error('NEXT_UNAUTHORIZED');
  }),
  forbiddenMock: vi.fn(() => {
    throw new Error('NEXT_FORBIDDEN');
  }),
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

type ReactElementLike = {
  readonly type: unknown;
  readonly props?: {
    readonly children?: unknown;
    readonly [key: string]: unknown;
  };
};

/**
 * Depth-first search for the first element whose component function/tag is
 * named `name`. Matched by `.name` (not reference identity) because each
 * test dynamically re-imports `@/app/hud/page` after `vi.resetModules()`,
 * which would give a statically-imported component reference a different
 * module instance than the one actually rendered.
 */
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

describe('/hud page auth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getHudMetricsMock.mockResolvedValue({ accessMode: 'admin' });
  });

  it('redirects kiosk bookmarks to /hud-tv', async () => {
    const { default: HudPage } = await import('@/app/hud/page');

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

    const { default: HudPage } = await import('@/app/hud/page');
    await expect(
      HudPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_UNAUTHORIZED');

    expect(unauthorizedMock).toHaveBeenCalled();
    expect(forbiddenMock).not.toHaveBeenCalled();
    expect(getHudMetricsMock).not.toHaveBeenCalled();
  });

  it('calls forbidden for signed-in non-admin users', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: true,
      hasAdminRole: false,
      userId: 'user_123',
    });

    const { default: HudPage } = await import('@/app/hud/page');
    await expect(
      HudPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_FORBIDDEN');

    expect(forbiddenMock).toHaveBeenCalled();
    expect(unauthorizedMock).not.toHaveBeenCalled();
    expect(getHudMetricsMock).not.toHaveBeenCalled();
  });

  it('renders the metrics dashboard for signed-in admins', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: true,
      hasAdminRole: true,
      userId: 'admin_1',
    });
    const metrics = { accessMode: 'admin' as const, generatedAt: 'now' };
    getHudMetricsMock.mockResolvedValue(metrics);

    const { default: HudPage } = await import('@/app/hud/page');
    const result = await HudPage({ searchParams: Promise.resolve({}) });

    // The gate passed cleanly -- neither escape hatch fired, and the real
    // admin data fetch happened. A mutation that makes the admin gate
    // unconditionally call forbidden()/unauthorized() (breaking all real
    // admin access) would fail these assertions.
    expect(unauthorizedMock).not.toHaveBeenCalled();
    expect(forbiddenMock).not.toHaveBeenCalled();
    expect(getHudMetricsMock).toHaveBeenCalledWith('admin');

    // Full DOM rendering of HudDashboardClient would require a QueryClient
    // provider and mocks for a dozen nested admin panels/charts -- assert
    // directly on the returned React element tree instead so this stays a
    // fast, focused test of the auth-gate wiring (metrics reach the
    // dashboard) rather than an integration test of dashboard internals.
    const dashboardElement = findElementByName(result, 'HudDashboardClient');
    expect(dashboardElement).not.toBeNull();
    expect(dashboardElement?.props?.initialMetrics).toEqual(metrics);
  });
});
