import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAuthSignupOnboardingCanaryStatusMock,
  getHudMetricsMock,
  getNightlyTestingAgentStatusMock,
  getPublicProfileCanaryStatusMock,
  requireCurrentAdminPageAccessMock,
} = vi.hoisted(() => ({
  getAuthSignupOnboardingCanaryStatusMock: vi.fn(),
  getHudMetricsMock: vi.fn(),
  getNightlyTestingAgentStatusMock: vi.fn(),
  getPublicProfileCanaryStatusMock: vi.fn(),
  requireCurrentAdminPageAccessMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/admin/page-access', () => ({
  requireCurrentAdminPageAccess: requireCurrentAdminPageAccessMock,
}));
vi.mock('@/lib/admin/ops-queries', () => ({
  getAuthSignupOnboardingCanaryStatus: getAuthSignupOnboardingCanaryStatusMock,
  getNightlyTestingAgentStatus: getNightlyTestingAgentStatusMock,
  getPublicProfileCanaryStatus: getPublicProfileCanaryStatusMock,
}));
vi.mock('@/lib/hud/metrics', () => ({ getHudMetrics: getHudMetricsMock }));
vi.mock('@/lib/env-server', () => ({ env: { HUD_AGENT_RUNS_FIXTURES: '0' } }));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));
vi.mock('@/components/features/admin/OperationalControlPanel', () => ({
  OperationalControlPanel: () => null,
}));
vi.mock('@/app/app/(shell)/admin/ops/HudDashboardClient', () => ({
  HudDashboardClient: () => null,
}));
vi.mock('@/app/app/(shell)/admin/ops/ReleaseToRevenueGmvPanel', () => ({
  ReleaseToRevenueGmvPanel: () => null,
}));

import AdminOpsPage from '@/app/app/(shell)/admin/ops/page';

describe('AdminOpsPage access boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCurrentAdminPageAccessMock.mockRejectedValue(
      new Error('NEXT_REDIRECT:/app')
    );
  });

  it('starts no admin data work before a non-admin is rejected', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(
      AdminOpsPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT:/app');

    expect(getHudMetricsMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getPublicProfileCanaryStatusMock).not.toHaveBeenCalled();
    expect(getAuthSignupOnboardingCanaryStatusMock).not.toHaveBeenCalled();
    expect(getNightlyTestingAgentStatusMock).not.toHaveBeenCalled();
  });
});
