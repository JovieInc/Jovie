import { describe, expect, it, vi } from 'vitest';
import type { CertificationEvidenceReceipt } from '@/lib/agent-os/certification';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  type AcquisitionCertificationCandidate,
  type AcquisitionCertificationPorts,
  AcquisitionCertificationStore,
  type AcquisitionDecisionRequest,
} from './certification-store';

const SUBJECT = 'acquisition:premade-artist-profile:lead1:run1';
const SHA = 'a'.repeat(40);
const NOW = '2026-09-12T22:00:00.000Z';
function proof(
  tier: CertificationEvidenceReceipt['tier']
): CertificationEvidenceReceipt {
  return {
    id: tier,
    tier,
    status: 'passed',
    sourceSha: SHA,
    ref: `fixture:${tier}`,
    digest: `fixture-digest:${tier}`,
    summary: 'Synthetic test evidence only',
  };
}
function candidate(): AcquisitionCertificationCandidate {
  return {
    subjectId: SUBJECT,
    leadId: 'lead1',
    runId: 'run1',
    profileId: 'profile1',
    revision: 'domain-revision-1',
    sourceRef: 'fixture:lead1/run1/revision1',
    displayName: 'Fixture artist',
    profileUrl: 'https://example.test/artist',
    claimUrl: 'https://example.test/claim',
    qualificationRef: 'fixture:qualification1',
    requestedScope: 'Review premade profile only; no external send',
    observedAt: '2026-09-12T21:00:00.000Z',
    expiresAt: '2026-09-13T21:00:00.000Z',
    packet: {
      contract: 'jovie.certification/v1',
      subject: {
        id: SUBJECT,
        kind: 'acquisition-premade-artist-profile',
        title: 'Fixture artist',
      },
      source: {
        repository: 'JovieInc/Jovie',
        ref: 'fixture:evaluator',
        sha: SHA,
        expectedSha: SHA,
        paths: ['lib/acquisition/kernel.ts'],
        digest: 'fixture:evaluator-source',
      },
      canonicalReferences: [proof('canonical_references')],
      invariantEvaluation: [proof('invariant_evaluation')],
      testsCoverage: [proof('tests_coverage')],
      visualProof: [proof('visual_proof')],
      requiredVariants: [
        {
          id: 'profile',
          label: 'Profile',
          sourceSha: SHA,
          proof: proof('required_variants'),
          requiredMediaIds: ['profile-media'],
        },
      ],
      itemMedia: [
        {
          id: 'profile-media',
          itemId: SUBJECT,
          variantId: 'profile',
          status: 'passed',
          sourceSha: SHA,
          ref: 'fixture:profile-media',
          digest: 'fixture:profile-content',
          summary: 'Fixture profile',
        },
      ],
    },
  };
}
function harness() {
  const records = new Map<string, unknown>();
  const backend: CertificationRecordBackend = {
    get: vi.fn(async key => records.get(key) ?? null),
    setIfAbsent: vi.fn(async (key, value) => {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    }),
    compareAndSet: vi.fn(async (key, expected, next) => {
      if (records.get(key) !== expected) return false;
      records.set(key, next);
      return true;
    }),
  };
  let current = candidate();
  const effects = new Map<string, { digest: string; receipt: string }>();
  const execute = vi.fn(
    async ({
      receipt,
    }: Parameters<
      NonNullable<AcquisitionCertificationPorts['effect']>['execute']
    >[0]) => {
      const prior = effects.get(receipt.dispatch.key);
      if (prior && prior.digest !== receipt.payloadDigest)
        throw new Error('Domain conflicting duplicate');
      const result = prior ?? {
        digest: receipt.payloadDigest,
        receipt: `effect:${effects.size + 1}`,
      };
      effects.set(receipt.dispatch.key, result);
      return result.receipt;
    }
  );
  const ports: AcquisitionCertificationPorts = {
    withCurrentCandidate: async (_subject, operation) =>
      operation(structuredClone(current)),
    authorize: vi.fn(async () => 'server-resolved-founder'),
    effect: { idempotency: 'durable-action-key-and-payload-digest', execute },
    now: () => NOW,
  };
  const store = new AcquisitionCertificationStore(backend, ports);
  return {
    store,
    backend,
    records,
    ports,
    effects,
    execute,
    replace: (next: AcquisitionCertificationCandidate) => {
      current = next;
    },
    async request(): Promise<AcquisitionDecisionRequest> {
      const projection = await store.project(SUBJECT);
      return {
        subjectId: SUBJECT,
        revision: current.revision,
        evidenceDigest: projection.evidenceDigest,
        actionId: 'action1',
        decision: 'approved',
        notes: null,
      };
    },
  };
}

describe('acquisition certification persistence', () => {
  it('persists a revision-bound decision and effect across reload and dedupes retries', async () => {
    const h = harness();
    const request = await h.request();
    expect((await h.store.project(SUBJECT)).canCertify).toBe(true);
    const receipt = await h.store.decide(request);
    expect(receipt.dispatch).toMatchObject({
      status: 'complete',
      effectReceipt: 'effect:1',
    });
    expect(receipt.decision.reviewer).toBe('server-resolved-founder');
    const reload = new AcquisitionCertificationStore(h.backend, h.ports);
    expect(await reload.decide(request)).toEqual(receipt);
    expect((await reload.project(SUBJECT)).receipts).toEqual([receipt]);
    expect(h.execute).toHaveBeenCalledTimes(1);
    expect(h.effects.size).toBe(1);
  });

  it('rejects conflicting duplicate payloads and does not dispatch again', async () => {
    const h = harness();
    const request = await h.request();
    await h.store.decide(request);
    await expect(
      h.store.decide({ ...request, notes: 'changed' })
    ).rejects.toThrow('Conflicting duplicate');
    expect(h.effects.size).toBe(1);
  });

  it('keeps incomplete and expired evidence unqualified with no action', async () => {
    const h = harness();
    const missing = candidate();
    h.replace({
      ...missing,
      qualificationRef: '',
      packet: {
        ...missing.packet,
        invariantEvaluation: [
          { ...proof('invariant_evaluation'), digest: null, sourceSha: null },
        ],
      },
    });
    const projection = await h.store.project(SUBJECT);
    expect(projection).toMatchObject({ state: 'working', canCertify: false });
    expect(projection.missing).toEqual(
      expect.arrayContaining(['qualificationRef', 'immutable_machine_receipts'])
    );
    await expect(h.store.decide(await h.request())).rejects.toThrow(
      'unqualified'
    );
    h.replace({ ...candidate(), expiresAt: NOW });
    expect((await h.store.project(SUBJECT)).missing).toContain(
      'fresh_evidence'
    );
    await expect(h.store.decide(await h.request())).rejects.toThrow(
      'unqualified'
    );
    expect(h.effects.size).toBe(0);
  });

  it('does not count its computed binding as missing upstream proof', async () => {
    const h = harness();
    const value = candidate();
    h.replace({
      ...value,
      packet: { ...value.packet, canonicalReferences: [] },
    });
    expect(await h.store.project(SUBJECT)).toMatchObject({
      state: 'working',
      canCertify: false,
      missing: ['canonical_candidate_evidence'],
    });
    await expect(h.store.decide(await h.request())).rejects.toThrow(
      'unqualified'
    );
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('binds actual candidate contents and requested scope separately from evaluator SHA', async () => {
    const h = harness();
    const request = await h.request();
    h.replace({ ...candidate(), claimUrl: 'https://example.test/other-claim' });
    await expect(h.store.decide(request)).rejects.toThrow('Stale');
    h.replace({ ...candidate(), requestedScope: 'A different decision' });
    await expect(h.store.decide(request)).rejects.toThrow('Stale');
    h.replace({ ...candidate(), revision: 'domain-revision-2' });
    await expect(h.store.decide(request)).rejects.toThrow('Stale');
    expect(h.effects.size).toBe(0);
  });

  it('rejects wrong-domain or mismatched canonical identity and server authority denial', async () => {
    const h = harness();
    const request = await h.request();
    await expect(h.store.project('marketing:component')).rejects.toThrow(
      'Wrong acquisition'
    );
    h.replace({ ...candidate(), leadId: 'wrong' });
    await expect(h.store.decide(request)).rejects.toThrow(
      'identities disagree'
    );
    h.replace(candidate());
    vi.mocked(h.ports.authorize).mockResolvedValue(null);
    await expect(h.store.decide(request)).rejects.toThrow('authority denied');
    expect(h.effects.size).toBe(0);
  });

  it('does not expose an action without a durable idempotent domain effect', async () => {
    const h = harness();
    const store = new AcquisitionCertificationStore(h.backend, {
      ...h.ports,
      effect: null,
    });
    expect(await store.project(SUBJECT)).toMatchObject({
      state: 'working',
      canCertify: false,
      missing: ['idempotent_domain_effect'],
    });
    await expect(store.decide(await h.request())).rejects.toThrow(
      'No idempotent'
    );
  });

  it('requires rejection reason and stores the rejection for linked remediation', async () => {
    const h = harness();
    const request = await h.request();
    await expect(
      h.store.decide({ ...request, decision: 'rejected' })
    ).rejects.toThrow('Invalid decision');
    const receipt = await h.store.decide({
      ...request,
      decision: 'rejected',
      notes: 'Wrong artist identity',
    });
    expect(receipt.decision).toMatchObject({
      decision: 'rejected',
      notes: 'Wrong artist identity',
    });
    expect(receipt.dispatch.status).toBe('complete');
  });

  it('retries a stale CAS and concurrent duplicate delivery without duplicate domain effect', async () => {
    const h = harness();
    const request = await h.request();
    vi.mocked(h.backend.compareAndSet).mockResolvedValueOnce(false);
    const receipts = await Promise.all([
      h.store.decide(request),
      h.store.decide(request),
    ]);
    expect(receipts[0]).toEqual(receipts[1]);
    expect((await h.store.project(SUBJECT)).receipts).toHaveLength(1);
    expect(h.effects.size).toBe(1);
  });

  it('fails closed when CAS cannot persist the pending decision', async () => {
    const h = harness();
    const request = await h.request();
    vi.mocked(h.backend.compareAndSet).mockResolvedValue(false);
    await expect(h.store.decide(request)).rejects.toThrow(
      'lost compare-and-set'
    );
    expect(h.execute).not.toHaveBeenCalled();
  });

  it('persists pending before effect, survives crash after effect before acknowledgment, and replays same key', async () => {
    const h = harness();
    const request = await h.request();
    const realExecute = h.execute.getMockImplementation()!;
    h.execute.mockImplementationOnce(async input => {
      const persisted = JSON.parse([...h.records.values()][0] as string);
      expect(persisted.receipts[0].dispatch.status).toBe('pending');
      await realExecute(input);
      throw new Error('Crash after domain effect before acknowledgment');
    });
    await expect(h.store.decide(request)).rejects.toThrow(
      'Crash after domain effect'
    );
    expect(h.effects.size).toBe(1);
    const reloaded = new AcquisitionCertificationStore(h.backend, h.ports);
    const result = await reloaded.decide(request);
    expect(result.dispatch).toMatchObject({
      status: 'complete',
      effectReceipt: 'effect:1',
    });
    expect(h.effects.size).toBe(1);
    expect(h.execute.mock.calls[0][0].receipt.payloadDigest).toBe(
      h.execute.mock.calls[1][0].receipt.payloadDigest
    );
    expect(h.execute.mock.calls[0][0].receipt.dispatch.key).toBe(
      h.execute.mock.calls[1][0].receipt.dispatch.key
    );
  });

  it('retains pending state after failed effect and blocks expired retry', async () => {
    const h = harness();
    const request = await h.request();
    h.execute.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(h.store.decide(request)).rejects.toThrow('Unavailable');
    expect((await h.store.project(SUBJECT)).receipts[0].dispatch.status).toBe(
      'pending'
    );
    h.replace({ ...candidate(), expiresAt: NOW });
    await expect(h.store.decide(request)).rejects.toThrow('Stale');
    expect(h.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed persisted state rather than resetting decision history', async () => {
    const h = harness();
    const request = await h.request();
    await h.store.decide(request);
    const key = [...h.records.keys()][0];
    const state = JSON.parse(h.records.get(key) as string);
    h.records.set(
      key,
      JSON.stringify({
        ...state,
        receipts: [...state.receipts, ...state.receipts],
      })
    );
    await expect(h.store.project(SUBJECT)).rejects.toThrow(
      'Invalid acquisition decision'
    );
    expect(h.effects.size).toBe(1);
  });
});
