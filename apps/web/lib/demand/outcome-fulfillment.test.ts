import { describe, expect, it } from 'vitest';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  DEMAND_ALLOCATION_KEY,
  governDemandAllocation,
} from './allocation-governor';
import {
  capabilityGapId,
  compilePresenceOutcome,
  supplierDigest,
} from './outcome-compiler';
import type {
  CapabilityDraft,
  CapabilitySupplier,
  CompileOutcomeCommand,
} from './outcome-contract';

// Synthetic source-owner receipts: these fixtures make no provider/runtime claim.
const NOW = new Date('2026-11-16T10:10:00.000Z');
const BEFORE = '2026-11-16T10:00:00.000Z';
const AFTER = '2026-11-17T10:00:00.000Z';
const BUILD = 'a'.repeat(40);
const scope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  subjectId: '22222222-2222-4222-8222-222222222222',
};
const otherScope = {
  ...scope,
  tenantId: '33333333-3333-4333-8333-333333333333',
};
const primitive = { id: 'profile.bio', version: 1, kind: 'fact' } as const;
const metrics = {
  informationGain: 1,
  correctness: 1,
  coverage: 1,
  successfulActionRate: 1,
  falseMatchRate: 0,
  freshnessSeconds: 60,
  latencyMs: 50,
  fullyLoadedCostCents: 4,
};
type Certification = NonNullable<
  CompileOutcomeCommand['certifications']
>[number];
type Outcome = NonNullable<CompileOutcomeCommand['outcomes']>[number];

function supplier(
  overrides: Partial<CapabilitySupplier> = {}
): CapabilitySupplier {
  return {
    scope,
    primitive,
    id: 'fixture:authorized-profile-source',
    version: 'adapter-v1',
    ownerRef: 'fixture:canonical-connector-owner',
    authority: 'read',
    route: 'connected_api',
    status: 'available',
    authorizationRef: 'fixture:tenant-account-read-consent',
    privacy: 'approved',
    terms: 'approved',
    policyRef: 'fixture:profile-read-policy-v1',
    reviewedAt: BEFORE,
    validUntil: AFTER,
    expected: metrics,
    trialCostCents: 1,
    ...overrides,
  };
}

function certification(
  source = supplier(),
  overrides: Partial<Certification> = {}
): Certification {
  return {
    id: `certification:${source.primitive.id}`,
    scope: source.scope,
    primitive: source.primitive,
    supplierDigest: supplierDigest(source),
    ownerRef: source.ownerRef!,
    authority: source.authority!,
    buildSha: BUILD,
    verifiedAt: BEFORE,
    expiresAt: AFTER,
    verdict: 'pass',
    evidenceRefs: ['fixture:adapter-conformance'],
    tests: (
      [
        'tenant-isolation',
        'revocation',
        'replay',
        'failure-recovery',
        'unsupported',
      ] as const
    ).map(id => ({ id, status: 'pass', evidenceRef: `fixture:test:${id}` })),
    ...overrides,
  };
}

function outcome(
  source = supplier(),
  overrides: Partial<Outcome> = {}
): Outcome {
  return {
    id: `outcome:${source.primitive.id}:1`,
    scope: source.scope,
    primitive: source.primitive,
    supplierDigest: supplierDigest(source),
    certificationId: certification(source).id,
    authority: source.authority!,
    buildSha: BUILD,
    jobId: `fixture:profile-current:${source.primitive.id}`,
    startedAt: '2026-11-16T10:05:00.000Z',
    completedAt: '2026-11-16T10:06:00.000Z',
    status: 'correct_completed',
    evidenceRefs: ['fixture:profile-observation'],
    realized: metrics,
    ...overrides,
  };
}

function fact(source = supplier()): CompileOutcomeCommand['facts'][number] {
  return {
    scope: source.scope,
    primitive: source.primitive,
    sourceRef: 'fixture:authorized-profile-api',
    supplierDigest: supplierDigest(source),
    evidenceRef: 'fixture:profile-observation',
    observedAt: '2026-11-16T10:06:00.000Z',
    validUntil: AFTER,
    state: 'known',
    reason: null,
    territory: null,
    match: 'verified',
  };
}

function command(
  overrides: Partial<CompileOutcomeCommand> = {}
): CompileOutcomeCommand {
  return {
    op: 'compile_outcome',
    scope,
    outcome: 'presence.profile-current/v1',
    demand: [
      {
        id: 'fixture:demand:profile-current',
        observedAt: BEFORE,
        evidenceRef: 'fixture:authenticated-unmet-request',
        provenance: {
          kind: 'internal-synthetic',
          sourceKey: 'fixture:creator',
        },
      },
    ],
    facts: [],
    suppliers: [supplier()],
    trials: [],
    certifications: [],
    outcomes: [],
    budget: {
      maxTrialCostCents: 5,
      maxConcurrentTrials: 1,
      valuePerUsefulOutcomeCents: 100,
      minCorrectness: 0.95,
      maxFalseMatchRate: 0.05,
      minCoverage: 0.5,
      maxFreshnessSeconds: 86400,
      maxLatencyMs: 2000,
    },
    ...overrides,
  };
}

function fulfilled(
  overrides: Partial<CompileOutcomeCommand> = {}
): CompileOutcomeCommand {
  return command({
    facts: [fact()],
    certifications: [certification()],
    outcomes: [outcome()],
    ...overrides,
  });
}

function bio(input: CompileOutcomeCommand, previous?: CapabilityDraft[]) {
  const prior = previous ?? compilePresenceOutcome(command(), NOW);
  return compilePresenceOutcome(input, NOW, prior).find(
    draft => draft.primitive.id === primitive.id
  )!;
}

function harness() {
  const records = new Map<string, unknown>();
  const backend: CertificationRecordBackend = {
    get: async key => records.get(key) ?? null,
    setIfAbsent: async (key, value) => {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    },
    compareAndSet: async (key, expected, next) => {
      if (records.get(key) !== expected) return false;
      records.set(key, next);
      return true;
    },
  };
  const send = (value: unknown) =>
    governDemandAllocation({
      backend,
      command: value,
      now: NOW,
      gate: {
        status: 'green',
        evaluatedAt: NOW.toISOString(),
        ref: 'fixture:shipping-capacity-green',
      },
    });
  return { records, backend, send };
}

describe('source-owner certification and completed customer jobs', () => {
  it('requires certification and actual matching use before source observations become known', () => {
    for (const input of [
      fulfilled({ certifications: [], outcomes: [] }),
      fulfilled({ outcomes: [] }),
      fulfilled({ certifications: [] }),
      fulfilled({
        outcomes: [outcome(supplier(), { evidenceRefs: ['other'] })],
      }),
    ]) {
      expect(bio(input)).toMatchObject({ state: 'unknown', enabled: false });
    }
    expect(bio(fulfilled())).toMatchObject({
      state: 'known',
      enabled: false,
      fulfillment: {
        certified: true,
        correctCompletedJobs: 1,
        attemptedJobs: 1,
        fullyLoadedCostCents: 4,
        costPerSuccessfulOutcomeCents: 4,
        successfulOutcomeLatencyMs: { n: 1, p50: 50, p95: 50 },
        latestOutcome: 'correct_completed',
      },
    });
  });

  it.each([
    { ownerRef: 'fixture:other-owner' },
    { supplierDigest: 'b'.repeat(64) },
    { primitive: { ...primitive, id: 'profile.image' } },
    { expiresAt: NOW.toISOString() },
    { verdict: 'fail' as const },
    { authority: 'send' as const },
  ])(
    'rejects certification outside the current exact supplier binding: %j',
    change => {
      expect(
        bio(fulfilled({ certifications: [certification(supplier(), change)] }))
      ).toMatchObject({
        state: 'unknown',
        enabled: false,
        fulfillment: { certified: false, correctCompletedJobs: 0 },
      });
    }
  );

  it('requires every safety test to pass rather than accepting a certificate label', () => {
    const valid = certification();
    for (const tests of [
      valid.tests.slice(1),
      valid.tests.map(test =>
        test.id === 'revocation' ? { ...test, status: 'fail' as const } : test
      ),
    ]) {
      expect(
        bio(
          fulfilled({ certifications: [certification(supplier(), { tests })] })
        )
      ).toMatchObject({
        state: 'unknown',
        fulfillment: { certified: false, correctCompletedJobs: 0 },
      });
    }
  });

  it.each([
    { primitive: { ...primitive, id: 'profile.image' } },
    { supplierDigest: 'b'.repeat(64) },
    { certificationId: 'fixture:unrelated-certification' },
    { buildSha: 'b'.repeat(40) },
    { authority: 'send' as const },
  ])(
    'does not count outcomes outside their certified build, account, primitive or authority: %j',
    change => {
      expect(
        bio(fulfilled({ outcomes: [outcome(supplier(), change)] }))
      ).toMatchObject({
        state: 'unknown',
        enabled: false,
        fulfillment: { correctCompletedJobs: 0 },
      });
    }
  );

  it.each([
    'partial',
    'failed',
    'unknown',
    'revoked',
    'deleted',
    'unsupported',
  ] as const)(
    'preserves honest %s outcomes without successful-job credit',
    status => {
      expect(
        bio(fulfilled({ outcomes: [outcome(supplier(), { status })] }))
      ).toMatchObject({
        state: 'unknown',
        enabled: false,
        fulfillment: {
          correctCompletedJobs: 0,
          attemptedJobs: 1,
          costPerSuccessfulOutcomeCents: null,
          latestOutcome: status,
        },
      });
    }
  );

  it('counts unique jobs and their latest receipt, including failed work in successful-outcome cost', () => {
    const previous = outcome();
    const failed = outcome(supplier(), {
      id: 'outcome:failed-job',
      jobId: 'fixture:second-job',
      completedAt: '2026-11-16T10:07:00.000Z',
      status: 'failed',
      realized: { ...metrics, fullyLoadedCostCents: 6 },
    });
    const corrected = outcome(supplier(), {
      id: 'outcome:correction',
      completedAt: '2026-11-16T10:08:00.000Z',
      realized: { ...metrics, fullyLoadedCostCents: 3 },
    });
    const current = bio(fulfilled({ outcomes: [previous, failed, corrected] }));
    expect(current.fulfillment).toMatchObject({
      attemptedJobs: 2,
      correctCompletedJobs: 1,
      fullyLoadedCostCents: 10,
      costPerSuccessfulOutcomeCents: 10,
      latestOutcome: 'correct_completed',
    });
  });

  it('invalidates a previous success after a later failure and refuses timestamp ties', () => {
    const success = outcome();
    for (const completedAt of [
      success.completedAt,
      '2026-11-16T10:08:00.000Z',
    ]) {
      const failure = outcome(supplier(), {
        id: 'outcome:later-failure',
        completedAt,
        status: 'failed',
      });
      const current = bio(fulfilled({ outcomes: [success, failure] }));
      expect(current).toMatchObject({
        state: 'unknown',
        enabled: false,
        fulfillment: { attemptedJobs: 1, correctCompletedJobs: 0 },
      });
      expect(current.decision.kind).not.toBe('promote');
    }
  });

  it('recovers a failed job only after a newer certified completion with fresh linked evidence', () => {
    const failure = outcome(supplier(), {
      id: 'outcome:failed-attempt',
      completedAt: '2026-11-16T10:07:00.000Z',
      status: 'failed',
    });
    const previous = compilePresenceOutcome(
      fulfilled({ outcomes: [failure] }),
      NOW,
      compilePresenceOutcome(command(), NOW)
    );
    expect(
      previous.find(draft => draft.primitive.id === primitive.id)?.state
    ).toBe('unknown');
    const recovery = outcome(supplier(), {
      id: 'outcome:verified-recovery',
      startedAt: '2026-11-16T10:08:00.000Z',
      completedAt: '2026-11-16T10:09:00.000Z',
    });
    expect(bio(fulfilled({ outcomes: [recovery] }), previous)).toMatchObject({
      state: 'known',
      enabled: false,
      fulfillment: {
        attemptedJobs: 1,
        correctCompletedJobs: 1,
        latestOutcome: 'correct_completed',
      },
    });
  });

  it('invalidates old certification after a later failed certification or a supplier policy change', () => {
    const failed = certification(supplier(), {
      id: 'certification:later-failed',
      verifiedAt: '2026-11-16T10:08:00.000Z',
      verdict: 'fail',
    });
    expect(
      bio(fulfilled({ certifications: [certification(), failed] }))
    ).toMatchObject({ state: 'unknown', fulfillment: { certified: false } });
    const changed = supplier({ policyRef: 'fixture:profile-read-policy-v2' });
    expect(
      bio(fulfilled({ suppliers: [changed], facts: [fact(changed)] }))
    ).toMatchObject({
      state: 'unknown',
      fulfillment: { certified: false, correctCompletedJobs: 0 },
    });
  });

  it('fails closed when distinct certification receipts have the same verification time', () => {
    expect(
      bio(
        fulfilled({
          certifications: [
            certification(),
            certification(supplier(), { id: 'certification:ambiguous-peer' }),
          ],
        })
      )
    ).toMatchObject({
      state: 'unknown',
      fulfillment: { certified: false, correctCompletedJobs: 0 },
    });
  });

  it('keeps draft and send authority distinct from certified read or sync evidence', () => {
    for (const authority of ['read', 'sync', 'draft', 'send'] as const) {
      const source = supplier({ authority });
      const current = bio(
        fulfilled({
          suppliers: [source],
          facts: [fact(source)],
          certifications: [certification(source)],
          outcomes: [outcome(source)],
        })
      );
      expect(current.enabled).toBe(false);
      expect(current.state).toBe(
        ['read', 'sync'].includes(authority) ? 'known' : 'unknown'
      );
    }
  });

  it.each(['revoked', 'retired'] as const)(
    'removes %s sources from certified and completed-job credit',
    status => {
      expect(
        bio(fulfilled({ suppliers: [supplier({ status })] }))
      ).toMatchObject({
        state: 'unknown',
        enabled: false,
        fulfillment: {
          certified: false,
          correctCompletedJobs: 0,
          attemptedJobs: 0,
        },
      });
    }
  );

  it('does not resolve one tenant or subject with another account receipt', () => {
    for (const foreign of [
      otherScope,
      { ...scope, subjectId: otherScope.tenantId },
    ]) {
      for (const input of [
        fulfilled({
          certifications: [certification(supplier(), { scope: foreign })],
        }),
        fulfilled({ outcomes: [outcome(supplier(), { scope: foreign })] }),
      ]) {
        expect(() => bio(input)).toThrow('capability-receipt-scope-mismatch');
      }
    }
  });

  it('rejects future certification or use receipts and inverted receipt windows', () => {
    for (const certificate of [
      certification(supplier(), { verifiedAt: AFTER }),
      certification(supplier(), { expiresAt: BEFORE }),
    ]) {
      expect(() => bio(fulfilled({ certifications: [certificate] }))).toThrow(
        'invalid-capability-certification-window'
      );
    }
    for (const receipt of [
      outcome(supplier(), { completedAt: AFTER }),
      outcome(supplier(), { startedAt: '2026-11-16T10:09:00.000Z' }),
    ]) {
      expect(() => bio(fulfilled({ outcomes: [receipt] }))).toThrow(
        'invalid-capability-outcome-window'
      );
    }
  });

  it('invalidates only the changed supplier capability and retains independent image certification', () => {
    const image = supplier({
      id: 'fixture:image-source',
      primitive: { ...primitive, id: 'profile.image' },
    });
    const original = command({ suppliers: [supplier(), image] });
    const previous = compilePresenceOutcome(original, NOW);
    const changed = supplier({ version: 'adapter-v2' });
    const drafts = compilePresenceOutcome(
      command({
        suppliers: [changed, image],
        facts: [fact(changed), fact(image)],
        certifications: [certification(), certification(image)],
        outcomes: [outcome(), outcome(image)],
      }),
      NOW,
      previous
    );
    expect(
      drafts.find(draft => draft.primitive.id === 'profile.bio')
    ).toMatchObject({
      state: 'unknown',
      fulfillment: { certified: false },
    });
    expect(
      drafts.find(draft => draft.primitive.id === 'profile.image')
    ).toMatchObject({
      state: 'known',
      fulfillment: { certified: true, correctCompletedJobs: 1 },
    });
  });

  it('does not promote a certified route when actual useful-outcome economics fail the budget', () => {
    const current = bio(
      fulfilled({
        outcomes: [
          outcome(supplier(), {
            realized: { ...metrics, fullyLoadedCostCents: 200 },
          }),
        ],
      })
    );
    expect(current.decision.kind).not.toBe('promote');
    expect(current.enabled).toBe(false);
    expect(current.fulfillment).toMatchObject({
      correctCompletedJobs: 1,
      costPerSuccessfulOutcomeCents: 200,
    });
  });
});

describe('durable source canary in the existing allocation ledger', () => {
  it.each(['revoked', 'deleted'] as const)(
    'commits %s after a full evidence window and cannot revive an evicted certificate by replay',
    async status => {
      const h = harness();
      const image = supplier({
        id: 'fixture:independent-image-source',
        primitive: { ...primitive, id: 'profile.image' },
      });
      const sources = [supplier(), image];
      const facts = [
        {
          ...fact(),
          observedAt: '2026-11-16T10:01:00.000Z',
        },
        fact(image),
      ];
      const oldJobs = Array.from({ length: 100 }, (_, index) =>
        outcome(supplier(), {
          id: `outcome:retained:${index}`,
          jobId: `fixture:retained-job:${index}`,
          startedAt: BEFORE,
          completedAt: new Date(
            Date.parse('2026-11-16T10:01:00.000Z') + index * 1000
          ).toISOString(),
        })
      );
      const draftFor = (
        ledger: Awaited<ReturnType<typeof h.send>>,
        id = primitive.id
      ) =>
        ledger.rows.find(row => row.plan.capabilityDraft?.primitive.id === id)!
          .plan.capabilityDraft!;
      await h.send(command({ suppliers: sources }));
      await h.send(
        fulfilled({
          suppliers: sources,
          facts,
          certifications: [certification(), certification(image)],
          outcomes: [outcome(image)],
        })
      );
      const full = await h.send(
        fulfilled({ suppliers: sources, facts, outcomes: oldJobs })
      );
      expect(draftFor(full)).toMatchObject({
        state: 'known',
        fulfillment: { certified: true, correctCompletedJobs: 100 },
      });
      const unaffectedImage = draftFor(full, 'profile.image');
      const boundary = outcome(supplier(), {
        id: `outcome:retention-boundary:${status}`,
        jobId: `fixture:retention-boundary:${status}`,
        startedAt: '2026-11-16T10:07:00.000Z',
        completedAt: '2026-11-16T10:07:00.000Z',
        status,
      });
      const invalidated = await h.send(
        fulfilled({
          suppliers: sources,
          facts,
          outcomes: [boundary],
        })
      );
      const retained = draftFor(invalidated);
      expect(retained).toMatchObject({
        receiptFloor: oldJobs[0].completedAt,
        state: 'unknown',
        enabled: false,
        fulfillment: { certified: false, correctCompletedJobs: 0 },
      });
      expect(retained.outcomes).toHaveLength(100);
      expect(retained.certifications).toEqual([]);
      expect(draftFor(invalidated, 'profile.image')).toEqual(unaffectedImage);

      const replay = await h.send(
        fulfilled({
          suppliers: sources,
          facts,
          outcomes: [oldJobs[0]],
        })
      );
      expect(draftFor(replay)).toEqual(retained);
      expect(draftFor(replay, 'profile.image')).toEqual(unaffectedImage);
      const renewed = certification(supplier(), {
        id: 'certification:after-retention-and-revocation',
        verifiedAt: '2026-11-16T10:08:00.000Z',
      });
      const recovered = outcome(supplier(), {
        id: 'outcome:after-retention-and-revocation',
        jobId: 'fixture:after-retention-and-revocation',
        certificationId: renewed.id,
        startedAt: '2026-11-16T10:08:30.000Z',
        completedAt: '2026-11-16T10:09:00.000Z',
        evidenceRefs: ['fixture:retention-recovery-observation'],
      });
      const restored = await h.send(
        fulfilled({
          suppliers: sources,
          facts: [
            {
              ...fact(),
              observedAt: recovered.completedAt,
              evidenceRef: recovered.evidenceRefs[0],
            },
            fact(image),
          ],
          certifications: [renewed],
          outcomes: [recovered],
        })
      );
      expect(draftFor(restored)).toMatchObject({
        state: 'known',
        enabled: false,
        fulfillment: {
          certified: true,
          correctCompletedJobs: 1,
          attemptedJobs: 100,
        },
      });
      expect(draftFor(restored).receiptFloor! >= retained.receiptFloor!).toBe(
        true
      );
      expect(draftFor(restored, 'profile.image')).toEqual(unaffectedImage);
    }
  );

  it('retains a fail-closed floor when 101 tied receipts are all evicted', async () => {
    const h = harness();
    const tied = Array.from({ length: 100 }, (_, index) =>
      outcome(supplier(), {
        id: `outcome:tied:${index}`,
        jobId: `fixture:tied-job:${index}`,
      })
    );
    const draftFor = (ledger: Awaited<ReturnType<typeof h.send>>) =>
      ledger.rows.find(
        row => row.plan.id === capabilityGapId(scope, primitive)
      )!.plan.capabilityDraft!;
    await h.send(command());
    await h.send(fulfilled({ outcomes: tied }));
    const boundary = outcome(supplier(), {
      id: 'outcome:tied-deletion',
      jobId: 'fixture:tied-deletion',
      status: 'deleted',
    });
    const discarded = draftFor(
      await h.send(fulfilled({ outcomes: [boundary] }))
    );
    expect(discarded).toMatchObject({
      receiptFloor: boundary.completedAt,
      certifications: [],
      outcomes: [],
      state: 'unknown',
      enabled: false,
      fulfillment: {
        certified: false,
        correctCompletedJobs: 0,
        attemptedJobs: 0,
      },
    });
    const replayed = draftFor(await h.send(fulfilled({ outcomes: [tied[0]] })));
    expect(replayed).toEqual(discarded);
  });

  it.each(['revoked', 'deleted'] as const)(
    'requires a new owner certification after %s even when an in-flight job finishes successfully',
    async status => {
      const h = harness();
      await h.send(command());
      await h.send(fulfilled());
      const invalidation = outcome(supplier(), {
        id: `outcome:${status}:source-boundary`,
        jobId: `fixture:${status}:source-boundary`,
        startedAt: '2026-11-16T10:07:00.000Z',
        completedAt: '2026-11-16T10:07:00.000Z',
        status,
      });
      await h.send(fulfilled({ outcomes: [invalidation] }));
      const inFlight = outcome(supplier(), {
        id: 'outcome:in-flight-completion',
        jobId: 'fixture:in-flight-job',
        startedAt: '2026-11-16T10:05:00.000Z',
        completedAt: '2026-11-16T10:08:00.000Z',
      });
      const draft = (ledger: Awaited<ReturnType<typeof h.send>>) =>
        ledger.rows.find(
          row => row.plan.id === capabilityGapId(scope, primitive)
        )!.plan.capabilityDraft!;
      const finished = await h.send(fulfilled({ outcomes: [inFlight] }));
      expect(draft(finished)).toMatchObject({
        state: 'unknown',
        enabled: false,
        fulfillment: {
          certified: false,
          attemptedJobs: 3,
          correctCompletedJobs: 0,
          latestOutcome: 'correct_completed',
        },
      });
      // A stale available-source snapshot cannot erase the durable boundary.
      expect(draft(await h.send(fulfilled()))).toEqual(draft(finished));

      const renewed = certification(supplier(), {
        id: 'certification:renewed-by-canonical-owner',
        verifiedAt: '2026-11-16T10:08:00.000Z',
      });
      const restoredEvidence = 'fixture:post-renewal-profile-observation';
      const recovery = outcome(supplier(), {
        id: 'outcome:post-renewal-completion',
        jobId: 'fixture:post-renewal-job',
        certificationId: renewed.id,
        startedAt: '2026-11-16T10:08:30.000Z',
        completedAt: '2026-11-16T10:09:00.000Z',
        evidenceRefs: [restoredEvidence],
      });
      const restored = await h.send(
        fulfilled({
          certifications: [renewed],
          outcomes: [recovery],
          facts: [
            {
              ...fact(),
              evidenceRef: restoredEvidence,
              observedAt: recovery.completedAt,
            },
          ],
        })
      );
      expect(draft(restored)).toMatchObject({
        state: 'known',
        enabled: false,
        fulfillment: {
          certified: true,
          attemptedJobs: 4,
          correctCompletedJobs: 1,
          latestOutcome: 'correct_completed',
        },
      });
    }
  );

  it('retains cumulative job cost across older delivery and later lower-cost receipt replays', async () => {
    const h = harness();
    await h.send(command());
    await h.send(fulfilled());
    const cumulative = outcome(supplier(), {
      id: 'outcome:cumulative-cost',
      completedAt: '2026-11-16T10:08:00.000Z',
      realized: { ...metrics, fullyLoadedCostCents: 9 },
    });
    await h.send(fulfilled({ outcomes: [cumulative] }));
    for (const replay of [
      outcome(supplier(), {
        id: 'outcome:late-delivery-of-older-receipt',
        completedAt: '2026-11-16T10:05:30.000Z',
        realized: { ...metrics, fullyLoadedCostCents: 3 },
      }),
      outcome(supplier(), {
        id: 'outcome:lower-cost-cumulative-receipt',
        completedAt: '2026-11-16T10:09:00.000Z',
        realized: { ...metrics, fullyLoadedCostCents: 2 },
      }),
    ]) {
      const ledger = await h.send(fulfilled({ outcomes: [replay] }));
      const draft = ledger.rows.find(
        row => row.plan.id === capabilityGapId(scope, primitive)
      )!.plan.capabilityDraft!;
      expect(draft.fulfillment).toMatchObject({
        attemptedJobs: 1,
        correctCompletedJobs: 1,
        fullyLoadedCostCents: 9,
        costPerSuccessfulOutcomeCents: 9,
      });
    }
  });

  it('closes synthetic unmet demand through a deduplicated economic decision, certification and actual-use receipt', async () => {
    const h = harness();
    const first = await h.send(command());
    const gapId = capabilityGapId(scope, primitive);
    const row = (ledger: typeof first) =>
      ledger.rows.find(item => item.plan.id === gapId)!;
    expect(row(first).plan.capabilityDraft?.decision.kind).toBe('trial');
    expect(await h.send(command())).toEqual(first);
    const trial = {
      id: 'fixture:bounded-read-trial',
      supplierDigest: supplierDigest(supplier()),
      startedAt: BEFORE,
      completedAt: '2026-11-16T10:01:00.000Z',
      evidenceRefs: ['fixture:read-trial-result'],
      realized: metrics,
    };
    const measured = await h.send(command({ trials: [trial] }));
    expect(row(measured).plan.capabilityDraft).toMatchObject({
      state: 'unknown',
      enabled: false,
      decision: { kind: 'no_action' },
      fulfillment: { certified: false },
    });
    const certified = await h.send(
      command({
        trials: [trial],
        certifications: [certification()],
      })
    );
    expect(row(certified).plan.capabilityDraft).toMatchObject({
      state: 'unknown',
      enabled: false,
      decision: { kind: 'promote' },
      fulfillment: { certified: true, correctCompletedJobs: 0 },
    });
    const complete = await h.send(fulfilled({ trials: [trial] }));
    expect(row(complete).plan.capabilityDraft).toMatchObject({
      state: 'known',
      enabled: false,
      fulfillment: { certified: true, correctCompletedJobs: 1 },
    });
    expect(row(complete).decisions.at(-1)?.state).toBe('held');
    expect(h.records.size).toBe(1);
    expect(await h.send(fulfilled({ trials: [trial] }))).toEqual(complete);
    await expect(
      h.send({ op: 'claim', id: gapId, worker: 'fixture-worker' })
    ).rejects.toThrow('allocation-not-ready');
  });

  it('keeps receipt identities immutable and leaves durable state unchanged after a conflicting replay', async () => {
    for (const changed of [
      fulfilled({
        certifications: [certification(supplier(), { ownerRef: 'conflict' })],
      }),
      fulfilled({ outcomes: [outcome(supplier(), { status: 'failed' })] }),
    ]) {
      const h = harness();
      await h.send(command());
      await h.send(fulfilled());
      const before = h.records.get(DEMAND_ALLOCATION_KEY);
      await expect(h.send(changed)).rejects.toThrow(
        'capability-receipt-conflict'
      );
      expect(h.records.get(DEMAND_ALLOCATION_KEY)).toBe(before);
    }
  });

  it('merges concurrent certification and outcome receipts after CAS contention without duplicate completed jobs', async () => {
    const h = harness();
    await h.send(command());
    await Promise.all([
      h.send(command({ certifications: [certification()] })),
      h.send(command({ outcomes: [outcome()] })),
    ]);
    const result = await h.send(command({ facts: [fact()] }));
    const draft = result.rows.find(
      row => row.plan.id === capabilityGapId(scope, primitive)
    )!.plan.capabilityDraft!;
    expect(draft).toMatchObject({
      state: 'known',
      fulfillment: {
        certified: true,
        attemptedJobs: 1,
        correctCompletedJobs: 1,
      },
    });
    expect(draft.certifications).toHaveLength(1);
    expect(draft.outcomes).toHaveLength(1);
  });

  it('recovers a failed persistence attempt from the same event with one eventual outcome receipt', async () => {
    const h = harness();
    await h.send(command());
    const before = h.records.get(DEMAND_ALLOCATION_KEY);
    const persist = h.backend.compareAndSet;
    h.backend.compareAndSet = async () => {
      throw new Error('fixture:storage-unavailable');
    };
    await expect(h.send(fulfilled())).rejects.toThrow(
      'fixture:storage-unavailable'
    );
    expect(h.records.get(DEMAND_ALLOCATION_KEY)).toBe(before);
    h.backend.compareAndSet = persist;
    const result = await h.send(fulfilled());
    const draft = result.rows.find(
      row => row.plan.id === capabilityGapId(scope, primitive)
    )!.plan.capabilityDraft!;
    expect(draft.fulfillment).toMatchObject({
      attemptedJobs: 1,
      correctCompletedJobs: 1,
    });
    expect(draft.outcomes).toHaveLength(1);
    expect(await h.send(fulfilled())).toEqual(result);
  });
});
