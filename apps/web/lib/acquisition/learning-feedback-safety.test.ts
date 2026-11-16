import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fixturePacket,
  memoryCertificationBackend,
} from '@/lib/ovie/certifications/fixtures';
import {
  type AcquisitionCertificationCandidate,
  type AcquisitionCertificationPorts,
  AcquisitionCertificationStore,
} from './certification-store';
import {
  type AcquisitionLearningFeedback,
  type LearningFeedbackContext,
} from './learning-feedback';

const SUBJECT = 'acquisition:premade-artist-profile:safety:run1';
const NOW = '2026-11-16T05:00:00.000Z';

function safetyHarness() {
  const zero = {
    browserCalls: 0,
    humanReviewMinutes: 0,
    modelCalls: 0,
    repairCycles: 0,
    researchPages: 0,
    retries: 0,
    spendUsd: 0,
    variants: 0,
  };
  const context: LearningFeedbackContext = {
    tenantId: 'tenant-1',
    productId: 'jovie',
    cohortId: 'private-1',
    offerVersion: 'offer-v1',
    capability: 'profile-build',
    version: 'v1',
    budget: {
      cancelled: false,
      case: { limit: zero, used: zero },
      experiment: { limit: zero, used: zero },
    },
  };
  let candidate: AcquisitionCertificationCandidate = {
    subjectId: SUBJECT,
    leadId: 'safety',
    runId: 'run1',
    profileId: 'profile1',
    revision: 'candidate-v1',
    sourceRef: 'record://candidates/safety',
    displayName: 'Synthetic safety case',
    profileUrl: 'https://example.test/profile',
    claimUrl: 'https://example.test/claim',
    qualificationRef: 'record://qualification/safety',
    requestedScope: 'Private preparation only',
    observedAt: '2026-11-16T03:00:00.000Z',
    expiresAt: '2026-11-17T03:00:00.000Z',
    packet: fixturePacket(SUBJECT, {
      subject: {
        id: SUBJECT,
        kind: 'acquisition-premade-artist-profile',
        title: 'Synthetic safety case',
      },
    }),
  };
  const sources = new Map<string, AcquisitionLearningFeedback>();
  const memory = memoryCertificationBackend();
  const backend = { ...memory, compareAndSet: vi.fn(memory.compareAndSet) };
  const ports: AcquisitionCertificationPorts = {
    withCurrentCandidate: async (_id, operation) => operation(candidate),
    authorize: async () => null,
    effect: null,
    now: () => NOW,
    learningFeedback: {
      resolve: async ref => sources.get(ref),
      context: () => context,
    },
  };
  const store = new AcquisitionCertificationStore(backend, ports);
  function source(index = 0) {
    const ref = `record://creator-feedback/safety-${index}`;
    const value: AcquisitionLearningFeedback = {
      candidateRevision: 'candidate-v1',
      cohortId: 'private-1',
      offerVersion: 'offer-v1',
      source: {
        ref,
        revision: 'source-v1',
        occurredAt: '2026-11-16T04:00:00.000Z',
        receivedAt: '2026-11-16T04:10:00.000Z',
        kind: 'creator-feedback',
      },
      reason: 'Synthetic correctness failure',
      uncertainty: ['Commercial result unknown'],
      result: 'negative',
      event: {
        tenantId: 'tenant-1',
        productId: 'jovie',
        candidateId: 'safety',
        type: 'review_correction',
        capability: 'profile-build',
        version: 'v1',
        evidenceRefs: [ref],
        failureClass: 'broken_artifact',
        fixedVersion: null,
      },
    };
    sources.set(ref, value);
    return {
      request: {
        subjectId: SUBJECT,
        sourceRef: ref,
        expectedRevision: 'candidate-v1',
      },
      value,
    };
  }
  return {
    store,
    backend,
    context,
    ports,
    sources,
    source,
    replace: (update: Partial<AcquisitionCertificationCandidate>) => {
      candidate = { ...candidate, ...update };
    },
    candidate: () => candidate,
  };
}

// Replay must verify recorded history against the digests recorded at preparation
// (JOV-12804), never by re-planning through the live policy. The mock delegates to
// the actual policy by default so existing behavior is unchanged; tests below swap
// the implementation to simulate policy and owner revisions.
let actualPlan: typeof import('./learning-policy').planAcquisitionLearningEvent;
vi.mock('./learning-policy', async importOriginal => {
  const actual = await importOriginal<typeof import('./learning-policy')>();
  actualPlan = actual.planAcquisitionLearningEvent;
  return {
    ...actual,
    planAcquisitionLearningEvent: vi.fn(actual.planAcquisitionLearningEvent),
  };
});

describe('private acquisition feedback safety boundaries', () => {
  it.each(['reason', 'uncertainty'] as const)(
    'rejects credential-shaped freeform %s before private persistence',
    async field => {
      const h = safetyHarness();
      const { request, value } = h.source();
      const secret = ['Bearer', 'synthetic-fixture'].join(' ');
      if (field === 'reason') value.reason = secret;
      else value.uncertainty = [secret];
      await expect(h.store.ingestLearningFeedback(request)).rejects.toThrow();
      expect(h.backend.records.size).toBe(0);
    }
  );
  it('rechecks cancellation after a lost CAS and preserves the already committed history', async () => {
    const h = safetyHarness();
    const first = await h.store.ingestLearningFeedback(h.source().request);
    const next = h.source(1);
    h.backend.compareAndSet.mockClear().mockImplementationOnce(async () => {
      h.context.budget.cancelled = true;
      return false;
    });
    await expect(h.store.ingestLearningFeedback(next.request)).rejects.toThrow(
      'cancelled'
    );
    expect(h.backend.compareAndSet).toHaveBeenCalledTimes(1);
    expect((await h.store.project(SUBJECT)).learningFeedback).toEqual([first]);
  });

  it.each(['plan', 'eventKey', 'executionAuthority', 'duplicate'] as const)(
    'refuses tampered persisted %s instead of projecting it as canonical evidence',
    async field => {
      const h = safetyHarness();
      await h.store.ingestLearningFeedback(h.source().request);
      const [key, raw] = [...h.backend.records.entries()][0];
      const record = JSON.parse(raw as string);
      const saved = record.learningFeedback[0];
      if (field === 'plan') saved.plan.issue = 'JOV-9999';
      if (field === 'eventKey') saved.eventKey = 'f'.repeat(64);
      if (field === 'executionAuthority') saved.executionAuthority = 'send';
      if (field === 'duplicate') record.learningFeedback.push(saved);
      h.backend.records.set(key, JSON.stringify(record));
      const reloaded = new AcquisitionCertificationStore(h.backend, h.ports);
      await expect(reloaded.project(SUBJECT)).rejects.toThrow();
    }
  );

  it.each([
    'future-received',
    'reversed-source',
    'expired-candidate',
    'invalid-candidate',
    'future-candidate',
    'invalid-now',
  ] as const)(
    'rejects %s timestamps before any private record is initialized',
    async problem => {
      const h = safetyHarness();
      const { request, value } = h.source();
      if (problem === 'future-received')
        value.source.receivedAt = '2026-11-16T06:00:00.000Z';
      if (problem === 'reversed-source')
        value.source.occurredAt = '2026-11-16T04:20:00.000Z';
      if (problem === 'expired-candidate') h.replace({ expiresAt: NOW });
      if (problem === 'invalid-candidate') h.replace({ observedAt: 'unknown' });
      if (problem === 'future-candidate')
        h.replace({ observedAt: '2026-11-16T06:00:00.000Z' });
      const store =
        problem === 'invalid-now'
          ? new AcquisitionCertificationStore(h.backend, {
              ...h.ports,
              now: () => 'unknown',
            })
          : h.store;
      await expect(store.ingestLearningFeedback(request)).rejects.toThrow(
        'timestamps'
      );
      expect(h.backend.records.size).toBe(0);
    }
  );

  it('holds the private ceiling at 32 receipts and still reconciles an existing receipt', async () => {
    const h = safetyHarness();
    const first = h.source();
    first.value.event.failureClass = null;
    first.value.result = 'inconclusive';
    first.value.uncertainty = [];
    await h.store.ingestLearningFeedback(first.request);
    for (let index = 1; index < 32; index += 1)
      await h.store.ingestLearningFeedback(h.source(index).request);
    const before = (await h.store.project(SUBJECT)).learningFeedback;
    await expect(
      h.store.ingestLearningFeedback(h.source(32).request)
    ).rejects.toThrow('ceiling');
    expect(await h.store.ingestLearningFeedback(first.request)).toEqual(
      before[0]
    );
    expect((await h.store.project(SUBJECT)).learningFeedback).toEqual(before);
  });

  it('keeps a missing current source unqualified while retaining original feedback provenance', async () => {
    const h = safetyHarness();
    const saved = await h.store.ingestLearningFeedback(h.source().request);
    h.replace({ packet: { ...h.candidate().packet, source: null } });
    const projection = await h.store.project(SUBJECT);
    expect(projection.learningFeedback).toEqual([saved]);
    expect(projection.packet.canonicalReferences.at(-1)?.sourceSha).toBeNull();
    expect(projection.canCertify).toBe(false);
  });

  it.each(['canonicalReferences', 'invariantEvaluation'] as const)(
    'rejects a spoofed feedback identity supplied through upstream %s',
    async tier => {
      const h = safetyHarness();
      const original = h.candidate();
      const spoof = {
        ...original.packet[tier][0],
        id: 'acquisition-feedback:spoof',
      };
      h.replace({
        packet: {
          ...original.packet,
          [tier]: [...original.packet[tier], spoof],
        },
      });
      await expect(h.store.project(SUBJECT)).rejects.toThrow('Reserved');
      expect(h.backend.records.size).toBe(0);
    }
  );
});

describe('policy evolution replay (JOV-12804)', () => {
  afterEach(async () => {
    if (actualPlan) {
      const policy = await import('./learning-policy');
      vi.mocked(policy.planAcquisitionLearningEvent).mockImplementation(
        actualPlan
      );
    }
  });

  it('replays recorded history when the live policy changes, while real tampering still fails', async () => {
    const h = safetyHarness();
    const receipt = await h.store.ingestLearningFeedback(h.source().request);
    const policy = await import('./learning-policy');
    // A policy revision is simulated as a wholesale behavioral change.
    vi.mocked(policy.planAcquisitionLearningEvent).mockImplementation(() => {
      throw new Error('policy revision changed');
    });
    const reloaded = new AcquisitionCertificationStore(h.backend, h.ports);
    const projection = await reloaded.project(SUBJECT);
    expect(projection.learningFeedback).toEqual([receipt]);
    // Real tampering still fails, and verification never consults the live policy.
    const [key, raw] = [...h.backend.records.entries()][0];
    const record = JSON.parse(raw as string);
    record.learningFeedback[0].plan.issue = 'JOV-9999';
    h.backend.records.set(key, JSON.stringify(record));
    await expect(
      new AcquisitionCertificationStore(h.backend, h.ports).project(SUBJECT)
    ).rejects.toThrow('Invalid persisted acquisition feedback identity.');
    // Fresh preparation still resolves through the live policy.
    await expect(
      h.store.ingestLearningFeedback(h.source(1).request)
    ).rejects.toThrow('policy revision changed');
    expect(h.backend.records.size).toBe(1);
  });

  it('an owners change preserves the recorded route attribution while replay still verifies', async () => {
    const h = safetyHarness();
    const receipt = await h.store.ingestLearningFeedback(h.source().request);
    expect(receipt.plan).toMatchObject({ action: 'route', issue: 'JOV-5598' });
    const policy = await import('./learning-policy');
    vi.mocked(policy.planAcquisitionLearningEvent).mockImplementation(input => {
      const plan = actualPlan!(input);
      return plan.action === 'route'
        ? { ...plan, issue: 'JOV-0000', route: 'reassigned_owner' }
        : plan;
    });
    const reloaded = new AcquisitionCertificationStore(h.backend, h.ports);
    const projection = await reloaded.project(SUBJECT);
    expect(projection.learningFeedback[0].plan.issue).toBe('JOV-5598');
    expect(projection.learningFeedback[0].planDigest).toBe(receipt.planDigest);
    // A tampered route under the changed policy is still rejected.
    const [key, raw] = [...h.backend.records.entries()][0];
    const record = JSON.parse(raw as string);
    record.learningFeedback[0].plan.route = 'reassigned_owner';
    h.backend.records.set(key, JSON.stringify(record));
    await expect(
      new AcquisitionCertificationStore(h.backend, h.ports).project(SUBJECT)
    ).rejects.toThrow('Invalid persisted acquisition feedback identity.');
  });
});
