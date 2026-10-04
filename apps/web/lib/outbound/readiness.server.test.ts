import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eligibility: vi.fn(),
  queue: vi.fn(),
  linear: vi.fn(),
  readFile: vi.fn(),
  liveBuild: vi.fn(),
  results: [] as unknown[][],
}));

function chain(result: unknown[]) {
  const node: Record<string, unknown> = {};
  for (const key of ['from', 'where']) node[key] = () => node;
  node.limit = async () => result;
  node.then = (resolve: (value: unknown) => void) => resolve(result);
  return node;
}

vi.mock('@/lib/db', () => ({
  db: { select: () => chain(mocks.results.shift() ?? []) },
}));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  getAcquisitionEligibility: mocks.eligibility,
}));
vi.mock('./queue.server', () => ({ getOutboundQueue: mocks.queue }));
vi.mock('@/lib/ovie/linear-coordination-live', () => ({
  linearGraphql: mocks.linear,
}));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));
vi.mock('@/lib/ovie/shipping-state/configured.server', () => ({
  readConfiguredLiveBuild: mocks.liveBuild,
}));

import { getOutboundReadiness } from './readiness.server';

describe('getOutboundReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.results = [
      [{ built: 6, covered: 0 }],
      [{ enabled: false, dailySendCap: 5 }],
      [{ total: 6 }],
    ];
    mocks.eligibility.mockResolvedValue({ eligible: false, requirements: [] });
    mocks.queue.mockResolvedValue({
      counts: { ready: 44, certified: 0, approved: 0 },
      rows: [{ nextAction: 'build_profile' }, { nextAction: 'review_facts' }],
    });
    mocks.linear.mockResolvedValue({
      i0: {
        identifier: 'JOV-7192',
        title: 'Golden Path',
        url: 'https://linear.app/jovie/issue/JOV-7192',
        state: { name: 'In Progress', type: 'started' },
      },
      loop: { children: { nodes: [{ identifier: 'JOV-1' }] } },
    });
    mocks.liveBuild.mockResolvedValue({
      status: 'ok',
      delivery: {
        production: {
          sha: 'c16157e0000000000000000000000000000000000',
          deployedAt: '2026-10-04T03:33:00Z',
          behindMain: { state: 'measured-nonzero', value: 41 },
        },
      },
    });
    mocks.readFile.mockResolvedValue(
      '{"at":"2026-10-03T23:00:34.076Z","pass":false,"payers":0}\n'
    );
  });

  it('composes every live source', async () => {
    const readiness = await getOutboundReadiness(
      new Date('2026-10-04T12:00:00Z')
    );
    const byId = Object.fromEntries(
      readiness.items.map(item => [item.id, item])
    );
    expect(byId.cone.status).toBe('red');
    expect(byId.funnel.detail).toContain('0/5 would pay');
    expect(byId.certifications.detail).toContain(
      '1 waiting on a profile build'
    );
    expect(byId.evidence.detail).toBe(
      '0 of 6 built profiles have any DSP, surface or release evidence'
    );
    expect(byId['send-path'].detail).toContain('6 routed');
    expect(byId.backlog.detail).toBe('1 open child issues');
    expect(byId.production.status).toBe('red');
    expect(
      byId.backlog.children?.find(child => child.id === 'issue:JOV-7192')
        ?.status
    ).toBe('red');
  });

  it('reads a failed source as unknown, never green', async () => {
    mocks.linear.mockRejectedValue(
      new Error('LINEAR_API_KEY is not configured')
    );
    mocks.eligibility.mockRejectedValue(new Error('redis down'));
    mocks.readFile.mockRejectedValue(new Error('ENOENT'));
    mocks.liveBuild.mockResolvedValue({ status: 'unavailable' });
    const readiness = await getOutboundReadiness();
    const byId = Object.fromEntries(
      readiness.items.map(item => [item.id, item.status])
    );
    expect(byId).toMatchObject({
      cone: 'unknown',
      funnel: 'unknown',
      backlog: 'unknown',
      production: 'unknown',
    });
  });
});
