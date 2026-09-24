import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETING_COMPONENT_REGISTRY } from '@/data/marketing/componentRegistry';
import type {
  CertificationEvidenceReceipt,
  CertificationReviewPacket,
} from '@/lib/agent-os/certification';
import {
  type CertificationRecordBackend,
  MarketingCertificationStore,
} from '@/lib/agent-os/certification-adapter';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  principal: vi.fn(),
  store: vi.fn(),
}));

vi.mock('@/lib/ovie/mcp/principal', () => ({
  resolveOviePrincipal: mocks.principal,
}));
vi.mock('@/lib/agent-os/certification-runtime-store', () => ({
  getMarketingCertificationStore: mocks.store,
}));

const request = () => new Request('https://jov.ie/api/ovie/certifications');

describe('Ovie marketing certification inventory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principal.mockResolvedValue({ authenticated: true, isAdmin: true });
  });

  it('rejects unauthenticated and non-admin callers before opening the store', async () => {
    mocks.principal.mockResolvedValueOnce({
      authenticated: false,
      isAdmin: false,
    });
    expect((await GET(request())).status).toBe(401);
    mocks.principal.mockResolvedValueOnce({
      authenticated: true,
      isAdmin: false,
    });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('returns the exact marketing registry projection without ledger writes or raw records', async () => {
    const backend: CertificationRecordBackend = {
      async get() {
        return null;
      },
      async compareAndSet() {
        throw new Error('inventory attempted a write');
      },
      async setIfAbsent() {
        throw new Error('inventory attempted a write');
      },
    };
    mocks.store.mockReturnValue(
      new MarketingCertificationStore(backend, MARKETING_COMPONENT_REGISTRY)
    );

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    expect(body.scope).toEqual({
      domain: 'marketing_components',
      universal: false,
    });
    expect(body.registryIds).toEqual(
      MARKETING_COMPONENT_REGISTRY.map(entry => entry.id)
    );
    expect(body.rows).toHaveLength(MARKETING_COMPONENT_REGISTRY.length);
    expect(body.rows[0]).toMatchObject({
      identityId: MARKETING_COMPONENT_REGISTRY[0]?.id,
      state: 'working',
      tasteCardAvailable: false,
    });
    expect(JSON.stringify(body)).not.toContain('auditHistory');
    expect(JSON.stringify(body)).not.toContain('decisions');
  });

  it('reports a persisted taste candidate without claiming assurance qualified review readiness', async () => {
    const entry = MARKETING_COMPONENT_REGISTRY.find(item => item.sourceBacked);
    if (!entry?.resolvedSource)
      throw new Error('source-backed fixture required');
    const sourceSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const proof = (
      tier: CertificationEvidenceReceipt['tier'],
      id: string
    ): CertificationEvidenceReceipt => ({
      digest: `sha256:${id.padEnd(64, '0').slice(0, 64)}`,
      id,
      ref: `github:JovieInc/Jovie/${id}`,
      sourceSha,
      status: 'passed',
      summary: `${tier} passed`,
      tier,
    });
    const mediaId = `${entry.id}-media`;
    const variantId = `${entry.id}-default`;
    const packet: CertificationReviewPacket = {
      canonicalReferences: [proof('canonical_references', `${entry.id}-ref`)],
      contract: 'jovie.certification/v1',
      invariantEvaluation: [
        proof('invariant_evaluation', `${entry.id}-invariant`),
      ],
      itemMedia: [
        {
          digest: `sha256:${mediaId.padEnd(64, '0').slice(0, 64)}`,
          id: mediaId,
          itemId: entry.id,
          ref: `github:JovieInc/Jovie/${mediaId}`,
          sourceSha,
          status: 'passed',
          summary: 'media passed',
          variantId,
        },
      ],
      operational: {},
      requiredVariants: [
        {
          id: variantId,
          label: 'Default',
          proof: proof('required_variants', `${entry.id}-variant`),
          requiredMediaIds: [mediaId],
          sourceSha,
        },
      ],
      source: {
        expectedSha: sourceSha,
        paths: [entry.resolvedSource],
        ref: 'refs/heads/codex/certification-review-adapter',
        repository: 'JovieInc/Jovie',
        sha: sourceSha,
      },
      subject: {
        id: entry.id,
        kind: `marketing-${entry.kind}`,
        title: entry.storybookTitle,
      },
      testsCoverage: [proof('tests_coverage', `${entry.id}-coverage`)],
      visualProof: [proof('visual_proof', `${entry.id}-visual`)],
    };
    const records = new Map<string, unknown>();
    let inspecting = false;
    const backend: CertificationRecordBackend = {
      async get(key) {
        return records.get(key) ?? null;
      },
      async compareAndSet(key, expected, next) {
        if (inspecting) throw new Error('inventory attempted a write');
        if (records.get(key) !== expected) return false;
        records.set(key, next);
        return true;
      },
      async setIfAbsent(key, value) {
        if (inspecting) throw new Error('inventory attempted a write');
        if (records.has(key)) return false;
        records.set(key, value);
        return true;
      },
    };
    const store = new MarketingCertificationStore(
      backend,
      MARKETING_COMPONENT_REGISTRY
    );
    const admitted = await store.ingestPacket(
      packet,
      '2026-09-23T20:00:00.000Z'
    );
    expect(admitted.admission.state).toBe('review_ready');
    const gated = await store.projectReviewReady({
      assuranceProfiles: [],
      existingEntryId: null,
    });
    expect(gated.eligibleSubjectIds).not.toContain(entry.id);
    expect(gated.withheld).toContainEqual({
      reason: 'assurance_unqualified',
      subjectId: entry.id,
    });
    inspecting = true;
    mocks.store.mockReturnValue(store);

    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    const row = body.rows.find(
      (item: { identityId: string }) => item.identityId === entry.id
    );
    expect(row).toMatchObject({
      identityId: entry.id,
      state: 'review_ready',
      tasteCardAvailable: true,
      decisionEvidenceDigest: admitted.admission.decisionEvidenceDigest,
      blockers: [],
      updatedAt: '2026-09-23T20:00:00.000Z',
    });
    expect(row).not.toHaveProperty('reviewReady');
    expect(JSON.stringify(body)).not.toContain('canonicalReferences');
    expect(JSON.stringify(body)).not.toContain('auditHistory');
    expect(JSON.stringify(body)).not.toContain('decisions');
  });

  it('fails closed when principal lookup or persisted projection fails', async () => {
    mocks.principal.mockRejectedValueOnce(
      new Error('role service unavailable')
    );
    expect((await GET(request())).status).toBe(503);
    expect(mocks.store).not.toHaveBeenCalled();

    mocks.store.mockReturnValue({
      inspectLedger: vi.fn().mockRejectedValue(new Error('registry drift')),
    });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'certification_inventory_unavailable',
    });
  });
});
