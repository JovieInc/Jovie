import { describe, expect, it, vi } from 'vitest';
import { MARKETING_COMPONENT_REGISTRY } from '@/data/marketing/componentRegistry';
import {
  type AcquisitionCertificationCandidate,
  type AcquisitionCertificationPorts,
  AcquisitionCertificationStore,
} from '@/lib/acquisition/certification-store';
import {
  buildCertificationDecisionDigest,
  type CertificationEvidenceReceipt,
} from '@/lib/agent-os/certification';
import { MarketingCertificationStore } from '@/lib/agent-os/certification-adapter';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-cas';
import {
  FIXTURE_NOW,
  fixturePacket,
  fixtureReceipt,
  memoryCertificationBackend,
} from './fixtures';
import {
  type CustomerCertificationCandidateRef,
  MARKETING_ASSURANCE_GATE,
  type OvieCertificationInventoryDeps,
  parseOvieCertificationDecisionRequest,
  readOvieCertificationInventory,
  recordOvieCertificationDecision,
} from './inventory.server';
import type { CertificationPacketFile } from './packet-files.server';

vi.mock('@/lib/agent-os/certification-runtime-store', () => ({
  getMarketingCertificationStore: vi.fn(),
}));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  getAcquisitionEligibility: vi.fn(),
}));
vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: vi.fn(),
}));

function packetFile(
  subjectId: string,
  overrides: Partial<CertificationPacketFile> = {}
): CertificationPacketFile {
  return {
    domain: 'flows',
    surface: 'Golden Path',
    packetUpdatedAt: '2026-09-27T07:00:00.000Z',
    links: [{ label: 'Run', href: 'https://ci.test/1', kind: 'test_run' }],
    packet: fixturePacket(subjectId),
    file: `docs/certification/${subjectId}.packet.json`,
    ...overrides,
  };
}

function deps(
  files: readonly CertificationPacketFile[],
  backend = memoryCertificationBackend()
): OvieCertificationInventoryDeps & {
  readonly backendInstance: ReturnType<typeof memoryCertificationBackend>;
} {
  const marketingBackend = memoryCertificationBackend();
  return {
    backendInstance: backend,
    backend: () => backend,
    marketingStore: () =>
      new MarketingCertificationStore(
        marketingBackend,
        MARKETING_COMPONENT_REGISTRY
      ),
    readPacketFiles: async () => ({
      root: '/repo/docs/certification',
      files,
      issues: [
        {
          domain: null,
          source: 'docs/certification/bad.packet.json',
          message: 'Invalid JSON.',
        },
      ],
    }),
  };
}

describe('readOvieCertificationInventory', () => {
  it('composes marketing and packet domains with an honest denominator', async () => {
    const inventory = await readOvieCertificationInventory(
      deps([
        packetFile('signup'),
        packetFile('lyb-onboarding', {
          domain: 'lyb',
          surface: 'Onboarding',
          packet: fixturePacket('lyb-onboarding', {
            visualProof: [fixtureReceipt('visual_proof', 'v', 'failed')],
          }),
        }),
      ]),
      FIXTURE_NOW
    );

    expect(inventory).toMatchObject({
      contract: 'jovie.ovie-certification-inventory/v1',
      generatedAt: FIXTURE_NOW,
      universal: false,
    });
    const statusByDomain = Object.fromEntries(
      inventory.domains.map(domain => [domain.domain, domain.status])
    );
    expect(statusByDomain).toEqual({
      marketing_components: 'connected',
      customers: 'not_connected',
      flows: 'connected',
      public_profiles: 'empty',
      smart_links: 'empty',
      marketing: 'empty',
      lyb: 'connected',
      acquisition: 'not_connected',
    });
    expect(inventory.counts.total).toBe(
      MARKETING_COMPONENT_REGISTRY.length + 2
    );
    expect(inventory.counts.review_ready).toBe(1);
    expect(inventory.queue.contract).toBe('jovie.certification-inbox/v1');
    expect(inventory.queue.needsYou.map(item => item.subject.id)).toEqual([
      'signup',
    ]);
    expect(inventory.queue.blocked).toHaveLength(
      MARKETING_COMPONENT_REGISTRY.length + 1
    );
    // Review-ready work leads the table.
    expect(inventory.rows[0]).toMatchObject({
      id: 'flows:signup',
      state: 'review_ready',
      decision: { available: true },
    });
    const marketingRow = inventory.rows.find(
      row => row.domain === 'marketing_components'
    );
    expect(marketingRow?.decision.available).toBe(false);
    expect(inventory.issues).toContainEqual({
      domain: null,
      source: 'docs/certification/bad.packet.json',
      message: 'Invalid JSON.',
    });
  });

  it('reports a failed marketing ledger read as an error domain, not zero rows', async () => {
    const base = deps([packetFile('signup')]);
    const inventory = await readOvieCertificationInventory(
      {
        ...base,
        marketingStore: () =>
          ({
            inspectLedger: async () => {
              throw new Error('db down');
            },
          }) as unknown as MarketingCertificationStore,
      },
      FIXTURE_NOW
    );
    expect(
      inventory.domains.find(d => d.domain === 'marketing_components')
    ).toMatchObject({ status: 'error', rowCount: 0 });
    expect(inventory.rows.map(row => row.id)).toEqual(['flows:signup']);
  });

  it('fails a packet domain closed when its decision ledger cannot be read', async () => {
    const backend = memoryCertificationBackend();
    backend.records.set(
      'jovie:certification:v1:packet-decisions:flows',
      '{corrupt'
    );
    const inventory = await readOvieCertificationInventory(
      deps([packetFile('signup')], backend),
      FIXTURE_NOW
    );
    expect(inventory.domains.find(d => d.domain === 'flows')).toMatchObject({
      status: 'error',
      rowCount: 0,
    });
    expect(inventory.rows.some(row => row.domain === 'flows')).toBe(false);
    expect(inventory.issues).toContainEqual(
      expect.objectContaining({ domain: 'flows', source: 'ovie_operating_kv' })
    );
  });
});

describe('parseOvieCertificationDecisionRequest', () => {
  const valid = {
    rowId: 'flows:signup',
    evidenceDigest: `sha256:${'a'.repeat(64)}`,
    decision: 'approved',
    actionId: 'action-0001',
    notes: '  looks great ',
  };

  it('accepts a well-formed request and trims notes', () => {
    expect(parseOvieCertificationDecisionRequest(valid)).toEqual({
      ...valid,
      notes: 'looks great',
    });
  });

  it.each([
    ['non-object', null],
    ['missing domain separator', { ...valid, rowId: 'signup' }],
    ['bad digest', { ...valid, evidenceDigest: 'xyz' }],
    ['unknown decision', { ...valid, decision: 'maybe' }],
    ['short action id', { ...valid, actionId: 'a' }],
    [
      'request changes without a note',
      { ...valid, decision: 'changes_requested', notes: '   ' },
    ],
  ])('rejects %s', (_label, body) => {
    expect(parseOvieCertificationDecisionRequest(body)).toBeNull();
  });
});

describe('recordOvieCertificationDecision', () => {
  const file = packetFile('signup');
  const digest = buildCertificationDecisionDigest(file.packet);
  const request = {
    rowId: 'flows:signup',
    evidenceDigest: digest,
    decision: 'approved' as const,
    notes: null,
    actionId: 'action-0001',
  };

  it('records a founder approval and returns the refreshed row', async () => {
    const d = deps([file]);
    const outcome = await recordOvieCertificationDecision(
      request,
      'founder@example.test',
      d,
      '2026-09-27T08:00:00.000Z'
    );
    expect(outcome).toMatchObject({
      ok: true,
      row: {
        id: 'flows:signup',
        state: 'founder_locked',
        decision: { available: false },
      },
    });
    if (!outcome.ok) throw new Error('expected ok');
    expect(outcome.row.history[0]).toMatchObject({
      kind: 'decision',
      actor: 'founder@example.test',
    });
  });

  it('returns 409 for stale evidence and duplicate actions', async () => {
    const d = deps([file]);
    await expect(
      recordOvieCertificationDecision(
        { ...request, evidenceDigest: `sha256:${'b'.repeat(64)}` },
        'founder',
        d,
        '2026-09-27T08:00:00.000Z'
      )
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      error: 'decision_digest_mismatch',
    });
    await recordOvieCertificationDecision(
      request,
      'founder',
      d,
      '2026-09-27T08:00:00.000Z'
    );
    await expect(
      recordOvieCertificationDecision(
        request,
        'founder',
        d,
        '2026-09-27T08:01:00.000Z'
      )
    ).resolves.toMatchObject({
      ok: false,
      status: 409,
      error: 'duplicate_founder_decision',
    });
  });

  it('refuses marketing decisions without an assurance profile and unknown rows', async () => {
    const d = deps([file]);
    await expect(
      recordOvieCertificationDecision(
        { ...request, rowId: 'marketing_components:shell.header' },
        'founder',
        d
      )
    ).resolves.toEqual({
      ok: false,
      status: 409,
      error: 'assurance_profile_missing',
      message: MARKETING_ASSURANCE_GATE,
    });
    await expect(
      recordOvieCertificationDecision(
        { ...request, rowId: 'acquisition:lead-1' },
        'founder',
        d
      )
    ).resolves.toMatchObject({ ok: false, status: 404 });
    await expect(
      recordOvieCertificationDecision(
        { ...request, rowId: 'flows:missing' },
        'founder',
        d
      )
    ).resolves.toMatchObject({ ok: false, status: 404 });
    expect(d.backendInstance.records.size).toBe(0);
  });
});

const CUSTOMER_SUBJECT = 'acquisition:premade-artist-profile:lead1:run1';
const CUSTOMER_SHA = 'a'.repeat(40);
const CUSTOMER_NOW = '2026-09-12T22:00:00.000Z';

function customerProof(
  tier: CertificationEvidenceReceipt['tier']
): CertificationEvidenceReceipt {
  return {
    id: tier,
    tier,
    status: 'passed',
    sourceSha: CUSTOMER_SHA,
    ref: `fixture:${tier}`,
    digest: `fixture-digest:${tier}`,
    summary: 'Synthetic test evidence only',
  };
}

function customerCandidate(): AcquisitionCertificationCandidate {
  return {
    subjectId: CUSTOMER_SUBJECT,
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
        id: CUSTOMER_SUBJECT,
        kind: 'acquisition-premade-artist-profile',
        title: 'Fixture artist',
      },
      source: {
        repository: 'JovieInc/Jovie',
        ref: 'fixture:evaluator',
        sha: CUSTOMER_SHA,
        expectedSha: CUSTOMER_SHA,
        paths: ['lib/acquisition/kernel.ts'],
        digest: 'fixture:evaluator-source',
      },
      canonicalReferences: [customerProof('canonical_references')],
      invariantEvaluation: [customerProof('invariant_evaluation')],
      testsCoverage: [customerProof('tests_coverage')],
      visualProof: [customerProof('visual_proof')],
      requiredVariants: [
        {
          id: 'profile',
          label: 'Profile',
          sourceSha: CUSTOMER_SHA,
          proof: customerProof('required_variants'),
          requiredMediaIds: ['profile-media'],
        },
      ],
      itemMedia: [
        {
          id: 'profile-media',
          itemId: CUSTOMER_SUBJECT,
          variantId: 'profile',
          status: 'passed',
          sourceSha: CUSTOMER_SHA,
          ref: 'fixture:profile-media',
          digest: 'fixture:profile-content',
          summary: 'Fixture profile',
        },
      ],
    },
  };
}

function customerStoreHarness() {
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
  const effects = new Map<string, string>();
  const ports: AcquisitionCertificationPorts = {
    withCurrentCandidate: async (_subject, operation) =>
      operation(structuredClone(customerCandidate())),
    authorize: async () => 'server-resolved-founder',
    effect: {
      idempotency: 'durable-action-key-and-payload-digest',
      execute: async ({ receipt }) => {
        const prior = effects.get(receipt.dispatch.key);
        if (prior) return prior;
        const value = `effect:${effects.size + 1}`;
        effects.set(receipt.dispatch.key, value);
        return value;
      },
    },
    now: () => CUSTOMER_NOW,
  };
  return { store: new AcquisitionCertificationStore(backend, ports), backend };
}

function customerDeps(
  harness: ReturnType<typeof customerStoreHarness>,
  eligible = true
): Pick<
  OvieCertificationInventoryDeps,
  'customers' | 'acquisitionEligibility'
> {
  const candidate: CustomerCertificationCandidateRef = {
    subjectId: CUSTOMER_SUBJECT,
    revision: 'domain-revision-1',
    rank: 3,
    payScore: 0.8,
    fitScore: 0.6,
    heldFor: [],
    updatedAt: '2026-09-12T21:30:00.000Z',
  };
  return {
    acquisitionEligibility: async () =>
      eligible
        ? { eligible: true, verdict: 'ELIGIBLE', firstBlocker: null }
        : {
            eligible: false,
            verdict: 'BLOCKED',
            firstBlocker: {
              id: 'payment_entitlement',
              label: 'Verified payment',
              status: 'red',
              owner: 'billing',
              nextAction: 'Fix the Golden Path lane.',
              explanation: 'red',
              evidence: [],
            },
          },
    customers: {
      list: async () => [candidate],
      store: () => harness.store,
    },
  };
}

describe('customers certification domain', () => {
  it('reports not_connected when no prospect inventory is wired', async () => {
    const inventory = await readOvieCertificationInventory(
      deps([packetFile('signup')]),
      FIXTURE_NOW
    );
    expect(inventory.domains.find(d => d.domain === 'customers')).toMatchObject(
      { status: 'not_connected', rowCount: 0 }
    );
    expect(inventory.rows.some(row => row.domain === 'customers')).toBe(false);
  });

  it('projects prospects as rows carrying rank and scores, one inbox card each', async () => {
    const h = customerStoreHarness();
    const d = deps([packetFile('signup')]);
    const inventory = await readOvieCertificationInventory(
      { ...d, ...customerDeps(h) },
      FIXTURE_NOW
    );
    expect(
      inventory.domains.find(domain => domain.domain === 'customers')
    ).toMatchObject({ status: 'connected', rowCount: 1 });
    const row = inventory.rows.find(r => r.domain === 'customers');
    expect(row).toMatchObject({
      id: `customers:${CUSTOMER_SUBJECT}`,
      state: 'review_ready',
      rank: 3,
      payScore: 0.8,
      fitScore: 0.6,
      heldFor: [],
      decision: { available: true },
    });
    const card = inventory.queue.needsYou.find(
      item => item.domain === 'customers'
    );
    expect(card?.subject.id).toBe(CUSTOMER_SUBJECT);
    expect(card?.decisionEvidenceDigest).toBe(row?.decision.evidenceDigest);
  });

  it('holds prospects out of the founder queue while ACQUISITION_ELIGIBLE is false', async () => {
    const h = customerStoreHarness();
    const d = deps([packetFile('signup')]);
    const inventory = await readOvieCertificationInventory(
      { ...d, ...customerDeps(h, false) },
      FIXTURE_NOW
    );
    expect(
      inventory.queue.needsYou.some(item => item.domain === 'customers')
    ).toBe(false);
    const held = inventory.queue.blocked.find(
      item => item.domain === 'customers'
    );
    expect(held?.heldForMachineEvidence).toBe(true);
    expect(held?.blockers.map(blocker => blocker.code)).toContain(
      'machine_evidence_failed'
    );
    expect(held?.blockers.at(-1)?.summary).toContain(
      'first blocker payment_entitlement is red'
    );
  });

  it('lands the same store receipt whether approved via card or table path', async () => {
    const ovie = customerStoreHarness();
    const direct = customerStoreHarness();
    const d = deps([packetFile('signup')]);
    const inventory = await readOvieCertificationInventory(
      { ...d, ...customerDeps(ovie) },
      FIXTURE_NOW
    );
    const row = inventory.rows.find(r => r.domain === 'customers');
    const evidenceDigest = row?.decision.evidenceDigest;
    expect(evidenceDigest).toMatch(/^sha256:/);

    const outcome = await recordOvieCertificationDecision(
      {
        rowId: `customers:${CUSTOMER_SUBJECT}`,
        evidenceDigest: evidenceDigest as string,
        decision: 'approved',
        notes: null,
        actionId: 'action-0001',
      },
      'founder@example.test',
      { ...d, ...customerDeps(ovie) },
      '2026-09-27T08:00:00.000Z'
    );
    expect(outcome).toMatchObject({
      ok: true,
      row: { id: `customers:${CUSTOMER_SUBJECT}`, state: 'founder_locked' },
    });

    const directReceipt = await direct.store.decide({
      subjectId: CUSTOMER_SUBJECT,
      revision: 'domain-revision-1',
      evidenceDigest: evidenceDigest as string,
      actionId: 'action-0001',
      decision: 'approved',
      notes: null,
    });
    const ledgerReceipt = (await ovie.store.project(CUSTOMER_SUBJECT))
      .receipts[0];
    expect(ledgerReceipt).toEqual(directReceipt);
    expect(ledgerReceipt.dispatch).toMatchObject({
      status: 'complete',
      effectReceipt: 'effect:1',
    });
  });

  it('requires notes to reject a prospect and 404s unknown or unconnected rows', async () => {
    const h = customerStoreHarness();
    const d = deps([packetFile('signup')]);
    const digest = `sha256:${'c'.repeat(64)}`;
    expect(
      parseOvieCertificationDecisionRequest({
        rowId: `customers:${CUSTOMER_SUBJECT}`,
        evidenceDigest: digest,
        decision: 'rejected',
        notes: ' ',
        actionId: 'action-0001',
      })
    ).toBeNull();
    await expect(
      recordOvieCertificationDecision(
        {
          rowId: 'customers:acquisition:premade-artist-profile:ghost:run9',
          evidenceDigest: digest,
          decision: 'approved',
          notes: null,
          actionId: 'action-0001',
        },
        'founder',
        { ...d, ...customerDeps(h) }
      )
    ).resolves.toMatchObject({ ok: false, status: 404 });
    await expect(
      recordOvieCertificationDecision(
        {
          rowId: `customers:${CUSTOMER_SUBJECT}`,
          evidenceDigest: digest,
          decision: 'approved',
          notes: null,
          actionId: 'action-0001',
        },
        'founder',
        d
      )
    ).resolves.toMatchObject({ ok: false, status: 404 });
  });
});
