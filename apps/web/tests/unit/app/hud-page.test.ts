vi.mock('@/lib/ovie/privacy-lock/server', () => ({
  assertOviePrivacyUnlocked: vi.fn().mockResolvedValue(undefined),
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import HudPage from '@/app/hud/page';
import { AGENT_OS_ADMIN_FIXTURE_ARTIFACTS } from '@/lib/agent-os/fixtures';
import { env } from '@/lib/env-server';

const {
  redirectMock,
  unauthorizedMock,
  forbiddenMock,
  authorizeHudMock,
  getCurrentAdminPageAccessMock,
  getHudMetricsMock,
  getFounderFunnelDataMock,
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
  authorizeHudMock: vi.fn(),
  getCurrentAdminPageAccessMock: vi.fn(),
  getHudMetricsMock: vi.fn(),
  getFounderFunnelDataMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  unauthorized: unauthorizedMock,
  forbidden: forbiddenMock,
}));

vi.mock('@/lib/admin/page-access', () => ({
  getCurrentAdminPageAccess: getCurrentAdminPageAccessMock,
}));

vi.mock('@/lib/auth/hud', () => ({
  authorizeHud: authorizeHudMock,
}));

vi.mock('@/lib/hud/metrics', () => ({
  getHudMetrics: getHudMetricsMock,
}));

vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelData: getFounderFunnelDataMock,
}));

vi.mock('@/lib/hud/source-trust', () => ({
  isHudMetricValueAvailable: () => false,
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
 * named `name`. Matching by component name keeps this focused gate test from
 * importing and mocking the nested client dashboard solely to compare its
 * function reference.
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
    vi.clearAllMocks();
    authorizeHudMock.mockResolvedValue({ ok: false, reason: 'unauthorized' });
    getHudMetricsMock.mockResolvedValue({ accessMode: 'admin' });
    getFounderFunnelDataMock.mockResolvedValue(null);
  });

  it('renders kiosk HUD when the token is valid', async () => {
    authorizeHudMock.mockResolvedValue({ ok: true, mode: 'kiosk' });
    const metrics = {
      accessMode: 'kiosk' as const,
      generatedAt: 'now',
      sources: { stripe: { available: false }, mercury: { available: false } },
      overview: { mrrUsd: 0, balanceUsd: 0, defaultStatusDetail: 'unknown' },
    };
    getHudMetricsMock.mockResolvedValue(metrics);

    const result = await HudPage({
      searchParams: Promise.resolve({ kiosk: 'test-token' }),
    });

    expect(authorizeHudMock).toHaveBeenCalledWith('test-token');
    expect(getCurrentAdminPageAccessMock).not.toHaveBeenCalled();
    expect(getHudMetricsMock).toHaveBeenCalledWith('kiosk');
    const dashboardElement = findElementByName(result, 'HudDashboardClient');
    expect(dashboardElement).not.toBeNull();
    expect(dashboardElement?.props?.initialMetrics).toEqual(metrics);
    expect(dashboardElement?.props?.density).toBe('kiosk');
    expect(dashboardElement?.props?.presentationMode).toBe('token');
    expect(getFounderFunnelDataMock).not.toHaveBeenCalled();
  });

  it('calls unauthorized for signed-out users', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: false,
      hasAdminRole: false,
      userId: null,
    });

    await expect(
      HudPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_UNAUTHORIZED');

    expect(unauthorizedMock).toHaveBeenCalled();
    expect(forbiddenMock).not.toHaveBeenCalled();
    expect(getHudMetricsMock).not.toHaveBeenCalled();
  });

  it('calls unauthorized for a rejected kiosk token', async () => {
    authorizeHudMock.mockResolvedValue({ ok: false, reason: 'unauthorized' });
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: false,
      hasAdminRole: false,
      userId: null,
    });

    await expect(
      HudPage({ searchParams: Promise.resolve({ kiosk: 'bad-token' }) })
    ).rejects.toThrow('NEXT_UNAUTHORIZED');

    expect(authorizeHudMock).toHaveBeenCalledWith('bad-token');
    expect(getCurrentAdminPageAccessMock).toHaveBeenCalled();
    expect(unauthorizedMock).toHaveBeenCalled();
    expect(getHudMetricsMock).not.toHaveBeenCalled();
  });

  it('calls forbidden for signed-in non-admin users', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: true,
      hasAdminRole: false,
      userId: 'user_123',
    });

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
    const metrics = {
      accessMode: 'admin' as const,
      generatedAt: 'now',
      sources: { stripe: { available: false }, mercury: { available: false } },
      overview: { mrrUsd: 0, balanceUsd: 0, defaultStatusDetail: 'unknown' },
    };
    getHudMetricsMock.mockResolvedValue(metrics);

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
    expect(dashboardElement?.props?.density).toBe('shell');
    expect(dashboardElement?.props?.presentationMode).toBe('shell');
    expect(getFounderFunnelDataMock).toHaveBeenCalledWith('30d');
    expect(findElementByName(result, 'StandaloneProductPage')).toBeNull();
    expect(findElementByName(result, 'AdminPage')).not.toBeNull();
  });

  it('keeps legacy fs=1 on the shell dashboard without remounting chrome', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: true,
      hasAdminRole: true,
      userId: 'admin_1',
    });
    const metrics = {
      accessMode: 'admin' as const,
      generatedAt: 'now',
      sources: { stripe: { available: false }, mercury: { available: false } },
      overview: { mrrUsd: 0, balanceUsd: 0, defaultStatusDetail: 'unknown' },
    };
    getHudMetricsMock.mockResolvedValue(metrics);

    const result = await HudPage({
      searchParams: Promise.resolve({ fs: '1' }),
    });

    const dashboardElement = findElementByName(result, 'HudDashboardClient');
    expect(dashboardElement).not.toBeNull();
    expect(dashboardElement?.props?.density).toBe('shell');
    expect(dashboardElement?.props?.presentationMode).toBe('shell');
    expect(dashboardElement?.props?.initialMetrics).toEqual(metrics);
    const adminPage = findElementByName(result, 'AdminPage');
    expect(adminPage).not.toBeNull();
    expect(findElementByName(result, 'StandaloneProductPage')).toBeNull();
    const actions = adminPage?.props?.actions as ReactElementLike | undefined;
    expect((actions?.type as { name?: string })?.name).toBe(
      'HudFullscreenControl'
    );
  });

  it('keeps the packaged Mac query on the same shell dashboard', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: true,
      hasAdminRole: true,
      userId: 'admin_1',
    });
    const result = await HudPage({
      searchParams: Promise.resolve({ ovie: 'mac' }),
    });
    expect(getHudMetricsMock).toHaveBeenCalledWith('admin');
    expect(findElementByName(result, 'HudDashboardClient')).not.toBeNull();
    expect(findElementByName(result, 'AdminPage')).not.toBeNull();
    expect(findElementByName(result, 'OvieMacHud')).toBeNull();
  });
});

describe('HUD fixture payload selection', () => {
  it('omits fixture payloads by default and supplies them only when explicitly enabled', async () => {
    getCurrentAdminPageAccessMock.mockResolvedValue({
      isAuthenticated: true,
      hasAdminRole: true,
      userId: 'admin',
    });
    getHudMetricsMock.mockResolvedValue({ agentRuns: [] });
    getFounderFunnelDataMock.mockResolvedValue(null);
    const before = env.HUD_AGENT_RUNS_FIXTURES;
    try {
      env.HUD_AGENT_RUNS_FIXTURES = '0';
      const production = await HudPage({ searchParams: Promise.resolve({}) });
      expect(
        findElementByName(production, 'HudDashboardClient')?.props
          ?.initialFixtureAgentRuns
      ).toBeUndefined();
      env.HUD_AGENT_RUNS_FIXTURES = '1';
      const fixture = await HudPage({ searchParams: Promise.resolve({}) });
      expect(
        findElementByName(fixture, 'HudDashboardClient')?.props
          ?.initialFixtureAgentRuns
      ).toEqual(AGENT_OS_ADMIN_FIXTURE_ARTIFACTS);
    } finally {
      env.HUD_AGENT_RUNS_FIXTURES = before;
    }
  });
});
