import { describe, expect, it } from 'vitest';

import {
  AGENT_FIRST_SURFACES,
  CAPABILITY_COMPLETENESS,
  CAPABILITY_JOB_KINDS,
  capabilityCompletenessContractSchema,
  evaluateCompleteness,
  MODEL_ROUTER_COMPLETENESS_CONTRACT,
} from './completeness';
import { ACTION_CHANNELS } from './invocation';
import { ACTION_MANIFEST } from './manifest';

function baseJob(overrides: Record<string, unknown>) {
  return {
    id: 'invoke',
    kind: 'required',
    critical: true,
    state: 'certified',
    surfaces: ['api'],
    evidence: 'end-to-end proof',
    ...overrides,
  };
}

function contractWith(jobs: Record<string, unknown>[]) {
  return capabilityCompletenessContractSchema.parse({
    capabilityId: 'test.capability',
    schemaVersion: 1,
    promisedOutcome: 'outcome',
    jobs,
    nonGoals: [],
  });
}

describe('capability completeness contract', () => {
  it('rejects a certified job with no certified surface', () => {
    expect(() => contractWith([baseJob({ surfaces: [] })])).toThrow();
  });

  it('rejects a missing job with no recorded gap or explicit non-goal', () => {
    expect(() =>
      contractWith([
        baseJob({ state: 'missing', surfaces: [], critical: false }),
      ])
    ).toThrow();
  });

  it('accepts a missing non-critical job with a recorded gap', () => {
    const contract = contractWith([
      baseJob({ id: 'invoke' }),
      baseJob({
        id: 'export',
        kind: 'required',
        critical: false,
        state: 'missing',
        surfaces: [],
        gap: {
          affectedUsers: 'enterprise pilots',
          workaround: 'support ticket',
          owner: 'platform',
          priority: 'p1',
        },
      }),
    ]);
    expect(evaluateCompleteness(contract).certified).toBe(true);
    expect(evaluateCompleteness(contract).gaps).toEqual(['export']);
  });
});

describe('certification gate', () => {
  it.each(['required', 'recovery', 'trust'] as const)(
    'blocks certification when a critical %s job has no certified path',
    kind => {
      const contract = contractWith([
        baseJob({
          id: `${kind}-job`,
          kind,
          state: 'missing',
          surfaces: [],
          gap: {
            affectedUsers: 'all',
            workaround: 'none',
            owner: 'platform',
            priority: 'p0',
          },
        }),
      ]);
      const evaluation = evaluateCompleteness(contract);
      expect(evaluation.certified).toBe(false);
      expect(evaluation.blockers).toEqual([`${kind}-job`]);
    }
  );

  it('does not block on a non-critical missing prerequisite', () => {
    const contract = contractWith([
      baseJob({ id: 'invoke' }),
      baseJob({
        id: 'optional-setup',
        kind: 'prerequisite',
        critical: false,
        state: 'missing',
        surfaces: [],
        gap: {
          affectedUsers: 'some',
          workaround: 'manual step',
          owner: 'platform',
          priority: 'p2',
        },
      }),
    ]);
    expect(evaluateCompleteness(contract).certified).toBe(true);
  });
});

describe('registry binding', () => {
  it('every registered action has a completeness contract — no second registry', () => {
    expect(Object.keys(CAPABILITY_COMPLETENESS).sort()).toEqual(
      ACTION_MANIFEST.map(a => a.id).sort()
    );
  });

  it('contracts bind to the canonical action id they describe', () => {
    for (const action of ACTION_MANIFEST) {
      expect(CAPABILITY_COMPLETENESS[action.id].capabilityId).toBe(action.id);
    }
  });

  it('existing capabilities certify; fleet retains its live commissioning gap', () => {
    for (const contract of Object.values(CAPABILITY_COMPLETENESS)) {
      expect(evaluateCompleteness(contract).certified).toBe(
        !['fleet.', 'work.', 'defect.'].some(prefix =>
          contract.capabilityId.startsWith(prefix)
        )
      );
    }
  });

  it('job vocabulary covers required, recovery, and trust kinds', () => {
    for (const kind of ['required', 'recovery', 'trust']) {
      expect(CAPABILITY_JOB_KINDS).toContain(kind);
    }
  });
});

describe('B2B router pilot job matrix', () => {
  const REQUIRED_AUDIT_JOBS = [
    'authenticate',
    'install-agent',
    'invoke-route',
    'request-status',
    'health',
    'usage-cost',
    'budget-limits',
    'credential-lifecycle',
    'failure-retry',
    'observability',
    'support',
    'data-handling',
    'account-deletion-export',
    'billing',
  ];

  it('covers the full initial audit surface', () => {
    const jobIds = MODEL_ROUTER_COMPLETENESS_CONTRACT.jobs.map(j => j.id);
    for (const id of REQUIRED_AUDIT_JOBS) {
      expect(jobIds).toContain(id);
    }
  });

  it('certifies without assuming a full web dashboard', () => {
    expect(
      evaluateCompleteness(MODEL_ROUTER_COMPLETENESS_CONTRACT).certified
    ).toBe(true);
  });

  it('satisfies at least one job agent/API-first', () => {
    const agentFirst = MODEL_ROUTER_COMPLETENESS_CONTRACT.jobs.filter(
      job =>
        job.state === 'certified' &&
        job.surfaces.length > 0 &&
        job.surfaces.every(s =>
          (AGENT_FIRST_SURFACES as readonly string[]).includes(s)
        )
    );
    expect(agentFirst.length).toBeGreaterThan(0);
  });

  it('admits a direct UI control only where evidence earns it', () => {
    const webJobs = MODEL_ROUTER_COMPLETENESS_CONTRACT.jobs.filter(job =>
      job.surfaces.includes('web')
    );
    expect(webJobs.map(j => j.id)).toEqual(['budget-limits', 'billing']);
    for (const job of webJobs) {
      expect(job.evidence).toMatch(/high-frequency|invoices/i);
    }
  });

  it('surface vocabulary extends channels without forking them', () => {
    for (const job of MODEL_ROUTER_COMPLETENESS_CONTRACT.jobs) {
      for (const surface of job.surfaces) {
        expect([
          ...ACTION_CHANNELS,
          'api',
          'webhook',
          'public_channel',
        ]).toContain(surface);
      }
    }
  });
});
