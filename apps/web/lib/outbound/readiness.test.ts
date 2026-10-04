import { describe, expect, it } from 'vitest';
import {
  buildOutboundReadiness,
  parseFunnelTrend,
  type ReadinessInputs,
} from './readiness';

const NOW = new Date('2026-10-04T12:00:00Z');

const BLOCKED: ReadinessInputs = {
  now: NOW,
  cone: {
    eligible: false,
    requirements: [
      {
        id: 'entry',
        label: 'Entry',
        status: 'green',
        owner: 'eng',
        nextAction: 'x',
      },
      {
        id: 'payment_entitlement',
        label: 'Golden Path',
        status: 'red',
        owner: 'billing',
        nextAction: 'Fix the Golden Path lane failure tracked on JOV-7192.',
      },
    ],
  },
  funnel: {
    at: '2026-10-03T23:00:34.076Z',
    pass: false,
    payers: 0,
    worst: { stepId: 'start', score: 0.8 },
  },
  queue: { ready: 44, certified: 0, approved: 0, needsProfile: 38 },
  evidence: { built: 6, covered: 0 },
  sendPath: {
    pipelineEnabled: false,
    instantlyEnabled: false,
    instantlyConfigured: false,
    pendingRouted: 6,
    dailySendCap: 5,
  },
  issues: new Map([
    [
      'JOV-7192',
      {
        identifier: 'JOV-7192',
        title: 'Golden Path',
        url: 'https://linear.app/jovie/issue/JOV-7192',
        stateType: 'started',
        stateName: 'In Progress',
      },
    ],
    [
      'JOV-7794',
      {
        identifier: 'JOV-7794',
        title: 'Proof gaps',
        url: 'https://linear.app/jovie/issue/JOV-7794',
        stateType: 'completed',
        stateName: 'Done',
      },
    ],
  ]),
  openGrowthLoopChildren: 12,
};

function byId(
  readiness: ReturnType<typeof buildOutboundReadiness>,
  id: string
) {
  const item = readiness.items.find(entry => entry.id === id);
  if (!item) throw new Error(`missing ${id}`);
  return item;
}

describe('onboarding readiness', () => {
  it('shows today’s wait item by item', () => {
    const readiness = buildOutboundReadiness(BLOCKED);
    expect(readiness.ready).toBe(0);
    expect(readiness.total).toBe(6);
    expect(byId(readiness, 'cone')).toMatchObject({
      status: 'red',
      detail: '1 of 2 receipts not green',
    });
    expect(byId(readiness, 'cone').children?.[1]).toMatchObject({
      status: 'red',
      detail: 'Fix the Golden Path lane failure tracked on JOV-7192.',
    });
    expect(byId(readiness, 'funnel').detail).toBe(
      'Fail · 0/5 would pay · worst step start 0.8/10 · today'
    );
    expect(byId(readiness, 'certifications').detail).toBe(
      '6 built profiles to review · 38 waiting on a profile build · 0 certified · 0 approved'
    );
    expect(byId(readiness, 'evidence')).toMatchObject({
      status: 'red',
      detail: '0 of 6 built profiles have any DSP, surface or release evidence',
    });
    expect(byId(readiness, 'send-path').detail).toContain('Closed');
    expect(byId(readiness, 'backlog').detail).toBe('12 open child issues');
  });

  it('reads blocking Linear work, and unknown never counts as green', () => {
    const backlog = byId(buildOutboundReadiness(BLOCKED), 'backlog');
    const states = Object.fromEntries(
      (backlog.children ?? []).map(child => [child.id, child.status])
    );
    expect(states['issue:JOV-7192']).toBe('red');
    expect(states['issue:JOV-7794']).toBe('green');
    expect(states['issue:JOV-2332']).toBe('unknown');

    const unread = buildOutboundReadiness({
      ...BLOCKED,
      cone: null,
      funnel: null,
      queue: null,
      evidence: null,
      sendPath: null,
      issues: null,
      openGrowthLoopChildren: null,
    });
    expect(unread.ready).toBe(0);
    expect(
      unread.items
        .filter(item => item.status !== 'info')
        .map(item => item.status)
    ).toEqual([
      'unknown',
      'unknown',
      'unknown',
      'unknown',
      'unknown',
      'unknown',
    ]);
  });

  it('turns green as the wait clears', () => {
    const readiness = buildOutboundReadiness({
      ...BLOCKED,
      cone: { eligible: true, requirements: [] },
      funnel: { at: NOW.toISOString(), pass: true, payers: 4, worst: null },
      queue: { ready: 0, certified: 3, approved: 2, needsProfile: 0 },
      evidence: { built: 6, covered: 6 },
      sendPath: {
        ...BLOCKED.sendPath!,
        pipelineEnabled: true,
        instantlyEnabled: true,
        instantlyConfigured: true,
      },
      openGrowthLoopChildren: 0,
    });
    expect(readiness.ready).toBe(6);
  });

  it('states the transactional versus cold boundary', () => {
    expect(byId(buildOutboundReadiness(BLOCKED), 'boundary')).toMatchObject({
      status: 'info',
      detail: expect.stringContaining('transactional and is not gated'),
    });
  });

  it('parses the newest funnel judge line and skips torn lines', () => {
    expect(
      parseFunnelTrend(
        '{"at":"2026-10-02T00:00:00Z","pass":false,"payers":1}\n{"at":"2026-10-03T00:00:00Z","pass":true,"payers":4,"worst":null}\n{torn'
      )
    ).toEqual({
      at: '2026-10-03T00:00:00Z',
      pass: true,
      payers: 4,
      worst: null,
    });
    expect(parseFunnelTrend('')).toBeNull();
  });
});
