import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  blocker: vi.fn(),
}));

vi.mock('@/lib/acquisition/eligibility.server', () => ({
  getAcquisitionEligibility: vi.fn(),
}));
vi.mock('@/lib/analytics/signup-funnel.server', () => ({
  getSummerFunnel: vi.fn(),
}));
vi.mock('@/lib/admin/founder-funnel', () => ({
  getFounderFunnelData: vi.fn(),
}));
vi.mock('@/lib/admin/waitlist', () => ({ getWaitlistMetrics: vi.fn() }));
vi.mock('@/lib/ovie/shipping-state/configured.server', () => ({
  publishConfiguredShippingState: vi.fn(),
}));
vi.mock('@/lib/ovie/mcp/founder-work', () => ({
  createLiveFounderWorkReader: () => ({ listLinearIssues: vi.fn() }),
}));
vi.mock('./company-state', async importOriginal => ({
  ...(await importOriginal<typeof import('./company-state')>()),
  buildCompanyState: mocks.build,
}));
vi.mock('./home/company-blocker', () => ({ companyBlocker: mocks.blocker }));

import {
  type CompanyStateProducerDependencies,
  LIVE_COMPANY_BLOCKER_TTL_MS,
  readLiveCompanyBlocker,
  resetLiveCompanyBlockerForTests,
} from './company-state.server';

const now = new Date('2026-11-22T02:00:00.000Z');
const blocker = { id: 'funnel:paid', text: 'No one has paid yet' };

function dependencies() {
  return {
    getAcquisitionEligibility: vi.fn(async () => ({ evaluatedAt: 'e1' })),
    getSummerFunnel: vi.fn(async () => ({ observedAt: 'f1' })),
    getFounderFunnelData: vi.fn(async () => ({})),
    getWaitlistMetrics: vi.fn(async () => ({})),
    getLinearIssues: vi.fn(),
    publishShippingState: vi.fn(),
    redis: null,
  } as unknown as CompanyStateProducerDependencies & {
    getAcquisitionEligibility: ReturnType<typeof vi.fn>;
    getLinearIssues: ReturnType<typeof vi.fn>;
    publishShippingState: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetLiveCompanyBlockerForTests();
  mocks.build.mockReturnValue({ generatedAt: now.toISOString() });
  mocks.blocker.mockReturnValue(blocker);
});

describe('readLiveCompanyBlocker', () => {
  it('names the blocker from live sources without publishing or execution reads', async () => {
    const deps = dependencies();
    await expect(readLiveCompanyBlocker(now, deps)).resolves.toEqual({
      blocker,
      generatedAt: now.toISOString(),
      source: 'live',
    });
    expect(deps.publishShippingState).not.toHaveBeenCalled();
    expect(deps.getLinearIssues).not.toHaveBeenCalled();
  });

  it('shares one live read per instance until the TTL passes', async () => {
    const deps = dependencies();
    await readLiveCompanyBlocker(now, deps);
    await readLiveCompanyBlocker(new Date(now.getTime() + 60_000), deps);
    expect(deps.getAcquisitionEligibility).toHaveBeenCalledTimes(1);
    await readLiveCompanyBlocker(
      new Date(now.getTime() + LIVE_COMPANY_BLOCKER_TTL_MS + 1),
      deps
    );
    expect(deps.getAcquisitionEligibility).toHaveBeenCalledTimes(2);
  });

  it('does not keep a failed read, so the next poll retries', async () => {
    const deps = dependencies();
    deps.getAcquisitionEligibility.mockRejectedValueOnce(new Error('github'));
    await expect(readLiveCompanyBlocker(now, deps)).rejects.toThrow('github');
    await expect(readLiveCompanyBlocker(now, deps)).resolves.toMatchObject({
      source: 'live',
    });
  });
});
