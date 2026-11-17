import { describe, expect, it, vi } from 'vitest';
import { MarketingCertificationStore } from '@/lib/agent-os/certification-adapter';
import {
  fixturePacket,
  memoryCertificationBackend,
} from '@/lib/ovie/certifications/fixtures';
import {
  type OvieCertificationInventoryDeps,
  readOvieCertificationInventory,
} from '@/lib/ovie/certifications/inventory.server';
import {
  type AcquisitionCertificationCandidate,
  type AcquisitionCertificationPorts,
  AcquisitionCertificationStore,
} from './certification-store';
import type { LearningBudget, LearningEvent } from './learning-contract';
import type { LearningFeedbackContext } from './learning-feedback';

vi.mock('@/lib/agent-os/certification-runtime-store', () => ({
  getMarketingCertificationStore: vi.fn(),
}));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  getAcquisitionEligibility: vi.fn(),
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: vi.fn(),
}));

const SUBJECT = 'acquisition:premade-artist-profile:lead1:run1';
const NOW = '2026-11-16T05:00:00.000Z';
const SOURCE = 'record://creator-feedback/source-1';
const ZERO = {
  browserCalls: 0,
  humanReviewMinutes: 0,
  modelCalls: 0,
  repairCycles: 0,
  researchPages: 0,
  retries: 0,
  spendUsd: 0,
  variants: 0,
};
function budget(): LearningBudget {
  return {
    cancelled: false,
    case: { limit: { ...ZERO }, used: { ...ZERO } },
    experiment: { limit: { ...ZERO }, used: { ...ZERO } },
  };
}
function candidate(): AcquisitionCertificationCandidate {
  return {
    subjectId: SUBJECT,
    leadId: 'lead1',
    runId: 'run1',
    profileId: 'profile1',
    revision: 'candidate-v1',
    sourceRef: 'record://candidates/lead1/run1',
    displayName: 'Synthetic artist',
    profileUrl: 'https://example.test/artist',
    claimUrl: 'https://example.test/claim',
    qualificationRef: 'record://qualification/lead1',
    requestedScope: 'Private profile review only',
    observedAt: '2026-11-16T03:00:00.000Z',
    expiresAt: '2026-11-17T03:00:00.000Z',
    packet: fixturePacket(SUBJECT, {
      subject: {
        id: SUBJECT,
        kind: 'acquisition-premade-artist-profile',
        title: 'Synthetic artist',
      },
    }),
  };
}

function feedback(ref = SOURCE) {
  const event: Omit<LearningEvent, 'evidenceDigest'> = {
    tenantId: 'tenant-1',
    productId: 'jovie',
    candidateId: 'lead1',
    type: 'review_correction',
    capability: 'profile-build',
    version: 'capability-v1',
    evidenceRefs: [ref],
    failureClass: 'broken_artifact',
    fixedVersion: null,
  };
  return {
    candidateRevision: 'candidate-v1',
    cohortId: 'private-artists-v1',
    offerVersion: 'entry-offer-v1',
    source: {
      ref,
      revision: 'source-v1',
      occurredAt: '2026-11-16T04:00:00.000Z',
      receivedAt: '2026-11-16T04:10:00.000Z',
      kind: 'creator-feedback' as const,
    },
    reason: 'Synthetic profile artifact failed its existing correctness check',
    uncertainty: ['Customer value and commercial outcomes remain unknown'],
    result: 'negative' as 'negative' | 'inconclusive' | 'observed',
    event,
  };
}

function harness() {
  const memory = memoryCertificationBackend();
  const backend = {
    ...memory,
    get: vi.fn(memory.get),
    setIfAbsent: vi.fn(memory.setIfAbsent),
    compareAndSet: vi.fn(memory.compareAndSet),
  };
  const sources = new Map<string, unknown>([[SOURCE, feedback()]]);
  let current = candidate();
  let context: LearningFeedbackContext = {
    tenantId: 'tenant-1',
    productId: 'jovie',
    cohortId: 'private-artists-v1',
    offerVersion: 'entry-offer-v1',
    capability: 'profile-build',
    version: 'capability-v1',
    budget: budget(),
  };
  const execute = vi.fn(async () => 'fixture:private-decision-receipt');
  const ports: AcquisitionCertificationPorts = {
    withCurrentCandidate: async (_subject, operation) =>
      operation(structuredClone(current)),
    authorize: vi.fn(async () => 'server-resolved-founder'),
    effect: { idempotency: 'durable-action-key-and-payload-digest', execute },
    now: () => NOW,
    learningFeedback: {
      resolve: vi.fn(async ref => structuredClone(sources.get(ref))),
      context: () => structuredClone(context),
    },
  };
  const store = new AcquisitionCertificationStore(backend, ports);
  const request = (sourceRef = SOURCE) => ({
    subjectId: SUBJECT,
    sourceRef,
    expectedRevision: current.revision,
  });
  return {
    backend,
    sources,
    ports,
    store,
    execute,
    request,
    context: (next: LearningFeedbackContext) => {
      context = next;
    },
    currentContext: () => structuredClone(context),
    replace: (next: AcquisitionCertificationCandidate) => {
      current = next;
    },
  };
}

describe('private acquisition feedback integration', () => {
  it('carries a synthetic source through canonical preparation into existing Ovi detail', async () => {
    const h = harness();
    const receipt = await h.store.ingestLearningFeedback(h.request());
    expect(receipt).toMatchObject({
      feedback: feedback(),
      preparedAt: NOW,
      executionAuthority: 'none',
      plan: { action: 'route', issue: 'JOV-5598', fixAction: 'create' },
    });
    const deps: OvieCertificationInventoryDeps = {
      backend: () => h.backend,
      marketingStore: () =>
        new MarketingCertificationStore(memoryCertificationBackend(), []),
      readPacketFiles: async () => ({ root: null, files: [], issues: [] }),
      featureRegistry: {
        list: async () => ({ items: [], sourceUpdatedAt: NOW }),
      },
      acquisitionEligibility: async () => ({
        eligible: true,
        verdict: 'ELIGIBLE',
        firstBlocker: null,
      }),
      customers: {
        list: async () => [
          {
            subjectId: SUBJECT,
            revision: 'candidate-v1',
            rank: 1,
            payScore: null,
            fitScore: null,
            heldFor: [],
            updatedAt: NOW,
          },
        ],
        store: () => h.store,
      },
    };
    const inventory = await readOvieCertificationInventory(deps, NOW);
    const row = inventory.rows.find(item => item.id === `customers:${SUBJECT}`);
    expect(row).toMatchObject({ state: 'review_ready' });
    expect(row?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ref: SOURCE, status: 'passed' }),
      ])
    );
    expect((await h.store.project(SUBJECT)).learningFeedback).toEqual([
      receipt,
    ]);
    expect(h.execute).not.toHaveBeenCalled();
  });
  it('suppresses concurrent duplicates and retains original provenance after restart', async () => {
    const h = harness();
    const receipts = await Promise.all([
      h.store.ingestLearningFeedback(h.request()),
      h.store.ingestLearningFeedback(h.request()),
    ]);
    expect(receipts[0]).toEqual(receipts[1]);
    const reload = new AcquisitionCertificationStore(h.backend, h.ports);
    expect(await reload.ingestLearningFeedback(h.request())).toEqual(
      receipts[0]
    );
    expect((await reload.project(SUBJECT)).learningFeedback).toEqual([
      receipts[0],
    ]);
    expect(h.backend.records.size).toBe(1);
    expect(h.execute).not.toHaveBeenCalled();
  });
  it('recovers a committed write whose acknowledgment was lost without another preparation', async () => {
    const h = harness();
    const write = h.backend.compareAndSet.getMockImplementation()!;
    h.backend.compareAndSet.mockImplementationOnce(async (...args) => {
      const committed = await write(...args);
      expect(committed).toBe(true);
      throw new Error('acknowledgment-lost');
    });
    await expect(h.store.ingestLearningFeedback(h.request())).rejects.toThrow(
      'acknowledgment-lost'
    );
    const reload = new AcquisitionCertificationStore(h.backend, h.ports);
    const receipt = await reload.ingestLearningFeedback(h.request());
    expect((await reload.project(SUBJECT)).learningFeedback).toEqual([receipt]);
    expect(h.backend.compareAndSet).toHaveBeenCalledTimes(1);
  });
  it('rejects conflicting bytes for the same immutable source revision', async () => {
    const h = harness();
    const first = await h.store.ingestLearningFeedback(h.request());
    h.sources.set(SOURCE, { ...feedback(), reason: 'A different claim' });
    await expect(h.store.ingestLearningFeedback(h.request())).rejects.toThrow();
    expect((await h.store.project(SUBJECT)).learningFeedback).toEqual([first]);
  });
  it('preserves an existing decision and denies its stale approval after feedback changes evidence', async () => {
    const h = harness();
    const before = await h.store.project(SUBJECT);
    expect(before.canCertify).toBe(true);
    const approval = {
      subjectId: SUBJECT,
      revision: 'candidate-v1',
      evidenceDigest: before.evidenceDigest,
      actionId: 'approved-before-feedback',
      decision: 'approved' as const,
      notes: null,
    };
    const prior = await h.store.decide(approval);
    await h.store.ingestLearningFeedback(h.request());
    const after = await h.store.project(SUBJECT);
    expect(after.evidenceDigest).not.toBe(before.evidenceDigest);
    expect(after.receipts).toEqual([prior]);
    expect(after.canCertify).toBe(true);
    await expect(
      h.store.decide({ ...approval, actionId: 'stale-retry' })
    ).rejects.toThrow();
    expect(h.execute).toHaveBeenCalledTimes(1);
  });
  it.each([
    'tenantId',
    'productId',
    'candidateId',
    'capability',
    'version',
  ] as const)('denies an event escaping its server-owned %s', async field => {
    const h = harness();
    const value = feedback();
    h.sources.set(SOURCE, {
      ...value,
      event: { ...value.event, [field]: 'elsewhere' },
    });
    await expect(h.store.ingestLearningFeedback(h.request())).rejects.toThrow();
    expect(h.backend.records.size).toBe(0);
  });
  it.each(['cohortId', 'offerVersion', 'candidateRevision'] as const)(
    'denies stale or escaped %s without persisting it',
    async field => {
      const h = harness();
      h.sources.set(SOURCE, { ...feedback(), [field]: 'elsewhere' });
      await expect(
        h.store.ingestLearningFeedback(h.request())
      ).rejects.toThrow();
      expect(h.backend.records.size).toBe(0);
    }
  );
  it('requires a current candidate and trusted resolver before accepting feedback', async () => {
    const h = harness();
    await expect(
      h.store.ingestLearningFeedback({
        ...h.request(),
        expectedRevision: 'old',
      })
    ).rejects.toThrow();
    const unconnected = new AcquisitionCertificationStore(h.backend, {
      ...h.ports,
      learningFeedback: undefined,
    });
    await expect(
      unconnected.ingestLearningFeedback(h.request())
    ).rejects.toThrow();
    expect(h.backend.records.size).toBe(0);
  });
  it('retains negative and inconclusive records and the incumbent offer without customer execution', async () => {
    const h = harness();
    const negative = await h.store.ingestLearningFeedback(h.request());
    const ref = 'record://creator-feedback/uncertain';
    h.sources.set(ref, {
      ...feedback(ref),
      result: 'inconclusive',
      event: { ...feedback(ref).event, failureClass: null },
    });
    const uncertain = await h.store.ingestLearningFeedback(h.request(ref));
    const projection = await h.store.project(SUBJECT);
    expect(projection.learningFeedback).toEqual([negative, uncertain]);
    expect(
      projection.learningFeedback.map(item => item.feedback.offerVersion)
    ).toEqual(['entry-offer-v1', 'entry-offer-v1']);
    expect(projection).toMatchObject({
      state: 'review_ready',
      canCertify: true,
    });
    expect(uncertain.plan.action).toBe('observe');
    expect(h.execute).not.toHaveBeenCalled();
  });
  it.each(['fleet-critique', 'external-advice'] as const)(
    'preserves %s as advice without accepting a supplied defect or landed-fix claim',
    async kind => {
      const h = harness();
      const value = feedback();
      h.sources.set(SOURCE, {
        ...value,
        source: { ...value.source, kind },
        event: {
          ...value.event,
          type: 'capability_fix_landed',
          fixedVersion: 'claimed-fix',
        },
      });
      const receipt = await h.store.ingestLearningFeedback(h.request());
      expect(receipt.feedback.event.failureClass).toBe('broken_artifact');
      expect(receipt.plan.action).toBe('observe');
      expect(receipt.executionAuthority).toBe('none');
      expect(h.execute).not.toHaveBeenCalled();
      const fresh = await h.store.project(SUBJECT);
      expect(fresh.packet.invariantEvaluation).toEqual(
        candidate().packet.invariantEvaluation
      );
      expect(fresh.packet.testsCoverage).toEqual(
        candidate().packet.testsCoverage
      );
      expect(fresh.canCertify).toBe(true);
      const provenance = fresh.packet.canonicalReferences.at(-1)!;
      expect(provenance.summary).toContain('efficacy unverified');
      const decision = await h.store.decide({
        subjectId: SUBJECT,
        revision: 'candidate-v1',
        evidenceDigest: fresh.evidenceDigest,
        actionId: 'fresh-advice-review',
        decision: 'approved',
        notes: null,
      });
      expect(decision.dispatch.status).toBe('complete');
    }
  );
  it('requires founder-private customer-zero criteria and fulfillment receipts without treating them as customer proof', async () => {
    const h = harness();
    const value = feedback();
    const source = { ...value.source, kind: 'customer-zero' };
    h.sources.set(SOURCE, { ...value, source });
    await expect(h.store.ingestLearningFeedback(h.request())).rejects.toThrow();
    const customerZero = {
      successCriteriaRef: 'record://human-service/criteria-1',
      resultRef: 'record://human-service/result-1',
      fulfillment: 'human',
      privacy: 'founder-private',
      status: 'unknown',
    };
    h.sources.set(SOURCE, {
      ...value,
      source,
      customerZero,
      result: 'inconclusive',
      event: { ...value.event, failureClass: null },
    });
    const receipt = await h.store.ingestLearningFeedback(h.request());
    expect(receipt.feedback.customerZero).toEqual(customerZero);
    expect((await h.store.project(SUBJECT)).learningFeedback).toEqual([
      receipt,
    ]);
    expect(h.execute).not.toHaveBeenCalled();
  });
  it('prepares a relevant repair only for the bound candidate while preserving failed history', async () => {
    const h = harness();
    const failed = await h.store.ingestLearningFeedback(h.request());
    const ref = 'record://capability-fixes/landed-v2';
    const value = feedback(ref);
    h.sources.set(ref, {
      ...value,
      result: 'observed',
      event: {
        ...value.event,
        type: 'capability_fix_landed',
        fixedVersion: 'capability-v2',
        failureClass: null,
      },
    });
    const repair = await h.store.ingestLearningFeedback(h.request(ref));
    expect(repair.plan).toMatchObject({
      action: 'rebuild',
      candidateIds: ['lead1'],
      reauthorizesOutreach: false,
      preserves: ['attempts', 'human-decisions', 'evidence-labels'],
    });
    expect((await h.store.project(SUBJECT)).learningFeedback).toEqual([
      failed,
      repair,
    ]);
    expect(h.execute).not.toHaveBeenCalled();
  });
  it('stops cancellation and unknown budgets before any persistence', async () => {
    for (const next of [
      { ...budget(), cancelled: true },
      {
        ...budget(),
        case: { ...budget().case, used: { ...ZERO, spendUsd: Number.NaN } },
      },
    ]) {
      const h = harness();
      h.context({ ...h.currentContext(), budget: next });
      await expect(
        h.store.ingestLearningFeedback(h.request())
      ).rejects.toThrow();
      expect(h.backend.records.size).toBe(0);
    }
  });
  it('bounds CAS retries and leaves no partial second receipt', async () => {
    const h = harness();
    const first = await h.store.ingestLearningFeedback(h.request());
    const ref = 'record://creator-feedback/second';
    h.sources.set(ref, feedback(ref));
    h.backend.compareAndSet.mockClear().mockResolvedValue(false);
    await expect(
      h.store.ingestLearningFeedback(h.request(ref))
    ).rejects.toThrow('compare-and-set');
    expect(h.backend.compareAndSet).toHaveBeenCalledTimes(5);
    expect((await h.store.project(SUBJECT)).learningFeedback).toEqual([first]);
  });
  it('keeps historical feedback bound to its original source SHA after a candidate rebuild', async () => {
    const h = harness();
    await h.store.ingestLearningFeedback(h.request());
    const original = candidate();
    const nextSha = 'b'.repeat(40);
    h.replace({
      ...original,
      packet: {
        ...original.packet,
        source: {
          ...original.packet.source!,
          sha: nextSha,
          expectedSha: nextSha,
        },
      },
    });
    const projection = await h.store.project(SUBJECT);
    expect(projection.learningFeedback[0].sourceSha).toBe(
      original.packet.source?.sha
    );
    expect(
      projection.packet.canonicalReferences.find(row => row.ref === SOURCE)
        ?.summary
    ).toContain(`original SHA ${original.packet.source?.sha}`);
    expect(projection.canCertify).toBe(false);
  });
  it('rejects raw contact fields and external credential-bearing source URLs', async () => {
    const h = harness();
    h.sources.set(SOURCE, { ...feedback(), email: 'private@example.test' });
    await expect(h.store.ingestLearningFeedback(h.request())).rejects.toThrow();
    vi.mocked(h.ports.learningFeedback!.resolve).mockClear();
    await expect(
      h.store.ingestLearningFeedback(
        h.request('https://example.test/feedback?token=secret')
      )
    ).rejects.toThrow();
    expect(h.ports.learningFeedback!.resolve).not.toHaveBeenCalled();
    expect(h.backend.records.size).toBe(0);
  });
});
