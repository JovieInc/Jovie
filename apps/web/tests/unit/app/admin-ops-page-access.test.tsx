import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getHudMetricsMock,
  getFounderFunnelDataMock,
  getOvieMacHudSnapshotMock,
} = vi.hoisted(() => ({
  getHudMetricsMock: vi.fn(),
  getFounderFunnelDataMock: vi.fn(),
  getOvieMacHudSnapshotMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/hud/metrics', () => ({ getHudMetrics: getHudMetricsMock }));
vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelData: getFounderFunnelDataMock,
}));
vi.mock('@/lib/hud/ovie-mac-hud.server', () => ({
  getOvieMacHudSnapshot: getOvieMacHudSnapshotMock,
}));
vi.mock('@/lib/env-server', () => ({
  env: { HUD_AGENT_RUNS_FIXTURES: '0' },
}));
vi.mock('@/lib/hud/source-trust', () => ({
  isHudMetricValueAvailable: () => false,
}));

import AdminOpsPage from '@/app/app/(shell)/admin/ops/page';

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

describe('authenticated in-shell Ops page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHudMetricsMock.mockResolvedValue({ accessMode: 'admin' });
    getFounderFunnelDataMock.mockResolvedValue(null);
    getOvieMacHudSnapshotMock.mockResolvedValue({
      generatedAtIso: '2026-08-28T00:00:00.000Z',
    });
  });

  it('renders packaged Ovie inside the shell route without loading the full dashboard', async () => {
    const result = await AdminOpsPage({
      searchParams: Promise.resolve({ ovie: 'mac', runtime: 'electron' }),
    });

    expect(findElementByName(result, 'OvieMacHud')?.props).toMatchObject({
      snapshot: { generatedAtIso: '2026-08-28T00:00:00.000Z' },
      fullscreen: false,
    });
    expect(getHudMetricsMock).not.toHaveBeenCalled();
    expect(findElementByName(result, 'HudDashboardClient')).toBeNull();
  });

  it('keeps fullscreen as a presentation of the same in-shell Ovie route', async () => {
    const result = await AdminOpsPage({
      searchParams: Promise.resolve({ ovie: 'mac', fs: '1' }),
    });

    expect(findElementByName(result, 'OvieMacHud')?.props?.fullscreen).toBe(
      true
    );
  });

  it('restores the full Ops dashboard body inside the shared shell', async () => {
    const metrics = { accessMode: 'admin', generatedAt: 'now' };
    getHudMetricsMock.mockResolvedValue(metrics);

    const result = await AdminOpsPage({ searchParams: Promise.resolve({}) });
    const dashboard = findElementByName(result, 'HudDashboardClient');

    expect(getHudMetricsMock).toHaveBeenCalledWith('admin');
    expect(getFounderFunnelDataMock).toHaveBeenCalledWith('30d');
    expect(dashboard?.props).toMatchObject({
      initialMetrics: metrics,
      density: 'shell',
      presentationMode: 'shell',
      kioskToken: null,
    });
  });
});
