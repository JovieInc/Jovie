import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockResolveDesignPartnerConfig,
  mockGetAppFlagValue,
  mockTriggerNewRelease,
  selectResults,
} = vi.hoisted(() => ({
  mockResolveDesignPartnerConfig: vi.fn(),
  mockGetAppFlagValue: vi.fn(),
  mockTriggerNewRelease: vi.fn(),
  selectResults: [] as unknown[][],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => {
  const chain = () => {
    const builder: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'orderBy'])
      builder[method] = () => builder;
    builder.limit = async () => selectResults.shift() ?? [];
    return builder;
  };
  return { db: { select: () => chain() } };
});
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: mockGetAppFlagValue }));
vi.mock('./design-partner-config', () => ({
  resolveDesignPartnerConfig: mockResolveDesignPartnerConfig,
}));
vi.mock('./trigger-new-release', () => ({
  triggerNewRelease: mockTriggerNewRelease,
}));

import {
  autostartDesignPartnerAutopilot,
  runDesignPartnerAutopilotSubJob,
} from './autostart';

const partner = {
  creatorUsername: 'tim',
  creatorProfileId: 'profile-1',
  userId: 'user-1',
};

describe('autostartDesignPartnerAutopilot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults.length = 0;
    mockResolveDesignPartnerConfig.mockResolvedValue(partner);
    mockGetAppFlagValue.mockResolvedValue(true);
  });

  it('starts a catalog cycle on the newest release when none ran recently', async () => {
    selectResults.push([{ id: 'release-new' }], []);
    mockTriggerNewRelease.mockResolvedValue({
      ok: true,
      run: { runId: 'run-1', status: 'created' },
    });

    await expect(autostartDesignPartnerAutopilot()).resolves.toEqual({
      status: 'started',
      runId: 'run-1',
      releaseId: 'release-new',
    });
    expect(mockTriggerNewRelease).toHaveBeenCalledWith({
      userId: 'user-1',
      enabled: true,
      trigger: { triggerSource: 'catalog', releaseId: 'release-new' },
    });
  });

  it('does not restart a release that already had a cycle in the window', async () => {
    selectResults.push([{ id: 'release-new' }], [{ id: 'run-old' }]);
    await expect(autostartDesignPartnerAutopilot()).resolves.toEqual({
      status: 'recent-cycle',
    });
    expect(mockTriggerNewRelease).not.toHaveBeenCalled();
  });

  it('stays off when the flag is off for the design partner', async () => {
    mockGetAppFlagValue.mockResolvedValue(false);
    await expect(autostartDesignPartnerAutopilot()).resolves.toEqual({
      status: 'flag-off',
    });
    expect(mockGetAppFlagValue).toHaveBeenCalledWith(
      'RELEASE_TO_REVENUE_AUTOPILOT',
      { userId: 'user-1' }
    );
    expect(mockTriggerNewRelease).not.toHaveBeenCalled();
  });

  it('reports an unconfigured design partner instead of failing silently', async () => {
    mockResolveDesignPartnerConfig.mockResolvedValue(null);
    await expect(autostartDesignPartnerAutopilot()).resolves.toEqual({
      status: 'not-configured',
    });
  });

  it('surfaces a trigger refusal code', async () => {
    selectResults.push([{ id: 'release-new' }], []);
    mockTriggerNewRelease.mockResolvedValue({
      ok: false,
      code: 'release-not-found',
    });
    await expect(autostartDesignPartnerAutopilot()).resolves.toEqual({
      status: 'trigger-failed',
      detail: 'release-not-found',
    });
  });

  it('throws a trigger refusal from the sub-job so cron monitoring sees it', async () => {
    selectResults.push([{ id: 'release-new' }], []);
    mockTriggerNewRelease.mockResolvedValue({
      ok: false,
      code: 'release-not-found',
    });
    await expect(runDesignPartnerAutopilotSubJob()).rejects.toThrow(
      'release-not-found'
    );
  });

  it('keeps a skip as a sub-job success', async () => {
    mockResolveDesignPartnerConfig.mockResolvedValue(null);
    await expect(runDesignPartnerAutopilotSubJob()).resolves.toEqual({
      status: 'not-configured',
    });
  });
});
