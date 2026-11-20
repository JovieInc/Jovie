import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  MARKETING_COMPONENT_REGISTRY,
  type MarketingRegistryEntry,
} from '@/data/marketing/componentRegistry';
import type {
  CertificationEvidenceReceipt,
  CertificationEvidenceStatus,
  CertificationReviewPacket as Packet,
} from '@/lib/agent-os/certification';
import {
  MarketingCertificationAssuranceError as AssuranceError,
  MARKETING_CERTIFICATION_AUDIT_ARCHIVE_PREFIX as AUDIT_PREFIX,
  type CertificationRecordBackend as Backend,
  buildMarketingAssuranceProfileDigest,
  evaluateMarketingAssurance,
  MARKETING_CERTIFICATION_HOT_AUDIT_PER_RECORD as HOT_AUDIT_LIMIT,
  type MarketingAssuranceEvidenceBinding,
  type MarketingAssuranceProfile,
  MarketingCertificationPersistenceError as PersistenceError,
  MarketingCertificationRegistryDriftError as RegistryDriftError,
  MARKETING_CERTIFICATION_LEDGER_MAX_BYTES as ROW_BUDGET_BYTES,
  type MarketingCertificationProjectionRow as Row,
  MARKETING_CERTIFICATION_PACKET_SHARD_PREFIX as SHARD_PREFIX,
  MARKETING_CERTIFICATION_PACKET_SHARD_SCHEMA as SHARD_SCHEMA,
  MARKETING_CERTIFICATION_STORE_KEY as STORE_KEY,
  MarketingCertificationStore as Store,
} from '@/lib/agent-os/certification-adapter';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REGISTRY = MARKETING_COMPONENT_REGISTRY.filter(
  entry => entry.sourceBacked
).slice(0, 2);
const [FIRST, SECOND] = REGISTRY;
const at = (time: string) => `2026-09-04T20:${time}.000Z`;
function memoryBackend(records = new Map<string, unknown>()): Backend {
  return {
    async compareAndSet(key, expected, next) {
      if (records.get(key) !== expected) return false;
      records.set(key, next);
      return true;
    },
    async get(key) {
      return records.get(key) ?? null;
    },
    async setIfAbsent(key, value) {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    },
  };
}
/** Production jsonb reads return decoded objects, retaining string CAS values. */
function jsonbBackend(records = new Map<string, unknown>()): Backend {
  const backend = memoryBackend(records);
  return {
    ...backend,
    async get(key) {
      const stored = await backend.get(key);
      return stored === null ? null : JSON.parse(stored as string);
    },
  };
}
function createStore(records = new Map<string, unknown>(), entries = REGISTRY) {
  return new Store(memoryBackend(records), entries);
}
function hotLedger(records: Map<string, unknown>) {
  return JSON.parse(records.get(STORE_KEY) as string);
}
function packetKey(records: Map<string, unknown>, identityId: string) {
  const revision = hotLedger(records).records[identityId].packetRevision;
  return `${SHARD_PREFIX}${identityId}${revision ? `:${revision}` : ''}`;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
function proof(
  tier: CertificationEvidenceReceipt['tier'],
  id: string,
  status: CertificationEvidenceStatus = 'passed'
): CertificationEvidenceReceipt {
  return {
    digest: `sha256:${id.padEnd(64, '0').slice(0, 64)}`,
    id,
    ref: `github:JovieInc/Jovie/${id}`,
    sourceSha: SHA,
    status,
    summary: `${tier} ${status}`,
    tier,
  };
}
function binding(
  tier: CertificationEvidenceReceipt['tier'],
  id: string
): MarketingAssuranceEvidenceBinding {
  return {
    expectedRef: `github:JovieInc/Jovie/${id}`,
    receiptId: id,
    selector: `selector:${id}`,
    tier,
  };
}
function assuranceProfile(
  entry: MarketingRegistryEntry,
  overrides: Partial<MarketingAssuranceProfile> = {}
): MarketingAssuranceProfile {
  const { profileDigest: _ignoredDigest, ...profileOverrides } = overrides;
  const profile = {
    mandatory: (
      [
        ['security', 'canonical_references'],
        ['integrity', 'invariant_evaluation'],
        ['accessibility', 'visual_proof'],
        ['correctness', 'tests_coverage'],
      ] as const
    ).map(([kind, tier]) => ({
      evidence: binding(tier, `${entry.id}-assurance-${kind}`),
      id: `${entry.id}-${kind}`,
      kind,
    })),
    notApplicable: [],
    optionalParity: [],
    provenance: binding(
      'canonical_references',
      `${entry.id}-assurance-profile-v1`
    ),
    subjectId: entry.id,
    version: 'v1',
    ...profileOverrides,
  } as Omit<MarketingAssuranceProfile, 'profileDigest'>;
  return {
    ...profile,
    profileDigest: buildMarketingAssuranceProfileDigest(profile),
  };
}
function packetForProfile(
  entry: MarketingRegistryEntry,
  profile: MarketingAssuranceProfile,
  overrides: Partial<Packet> = {}
): Packet {
  const candidate = packet(entry, overrides);
  return {
    ...candidate,
    canonicalReferences: candidate.canonicalReferences.map(receipt =>
      receipt.id === profile.provenance.receiptId
        ? { ...receipt, digest: profile.profileDigest }
        : receipt
    ),
  };
}
const ASSURANCE_PROFILES = REGISTRY.map(entry => assuranceProfile(entry));
const FIRST_PROFILE = ASSURANCE_PROFILES[0];
const OPTIONAL_PARITY = {
  desiredOutcome: 'Optional outcome',
  economics: {
    confidence: 'medium',
    displacedWork: 'other work',
    expectedRoi: 'bounded',
    measuredTrigger: 'measured signal',
    totalOwnershipCost: 'bounded',
  },
};
function ready(
  store: Store,
  assuranceProfiles = ASSURANCE_PROFILES,
  existingEntryId: string | null = null
) {
  return store.projectReviewReady({ assuranceProfiles, existingEntryId });
}
function packet(
  entry: MarketingRegistryEntry,
  overrides: Partial<Packet> = {}
): Packet {
  if (!entry.resolvedSource) throw new Error('source-backed fixture required');
  const mediaId = `${entry.id}-media`;
  const variantId = `${entry.id}-default`;
  return {
    canonicalReferences: [
      proof('canonical_references', `${entry.id}-ref`),
      {
        ...proof('canonical_references', `${entry.id}-assurance-profile-v1`),
        digest: assuranceProfile(entry).profileDigest,
      },
      proof('canonical_references', `${entry.id}-assurance-security`),
    ],
    contract: 'jovie.certification/v1',
    invariantEvaluation: [
      proof('invariant_evaluation', `${entry.id}-invariant`),
      proof('invariant_evaluation', `${entry.id}-assurance-integrity`),
    ],
    itemMedia: [
      {
        digest: `sha256:${mediaId.padEnd(64, '0').slice(0, 64)}`,
        id: mediaId,
        itemId: entry.id,
        ref: `github:JovieInc/Jovie/${mediaId}`,
        sourceSha: SHA,
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
        sourceSha: SHA,
      },
    ],
    source: {
      digest: `sha256:${entry.id.padEnd(64, '0').slice(0, 64)}`,
      expectedSha: SHA,
      paths: [entry.resolvedSource],
      ref: 'refs/heads/codex/certification-review-adapter',
      repository: 'JovieInc/Jovie',
      sha: SHA,
    },
    subject: {
      id: entry.id,
      kind: `marketing-${entry.kind}`,
      title: entry.storybookTitle,
    },
    testsCoverage: [
      proof('tests_coverage', `${entry.id}-coverage`),
      proof('tests_coverage', `${entry.id}-assurance-correctness`),
    ],
    visualProof: [
      proof('visual_proof', `dogfood-judge:${entry.id}`),
      proof('visual_proof', `${entry.id}-assurance-accessibility`),
    ],
    ...overrides,
  };
}
const digest = (row: Row) => row.admission.decisionEvidenceDigest!;
function decision(digest: string, id = 'decision-1') {
  return {
    decision: 'approved' as const,
    evidenceDigest: digest,
    id,
    notes: null,
    reviewer: 'Tim White',
  };
}
function approve(
  store: Store,
  entry: MarketingRegistryEntry,
  digest: string,
  decidedAt: string,
  id?: string
) {
  return store.recordFounderDecision({
    assuranceProfile: assuranceProfile(entry),
    decidedAt,
    decision: decision(digest, id),
    subjectId: entry.id,
  });
}
describe('MarketingCertificationStore', () => {
  it('inspects the exact registry without initializing durable state', async () => {
    const records = new Map<string, unknown>();
    const backend: Backend = {
      async get(key) {
        return records.get(key) ?? null;
      },
      async compareAndSet() {
        throw new Error('read-only inspection attempted a write');
      },
      async setIfAbsent() {
        throw new Error('read-only inspection attempted a write');
      },
    };
    const store = new Store(backend, REGISTRY);
    const projection = await store.inspectLedger(at('00:00'));
    expect(records.size).toBe(0);
    expect(projection.registryIds).toEqual(REGISTRY.map(entry => entry.id));
    expect(projection.rows).toHaveLength(REGISTRY.length);
    expect(projection.rows.every(row => row.packet.source === null)).toBe(true);
    expect(
      projection.rows.every(row => row.admission.state === 'working')
    ).toBe(true);
    await expect(store.inspectLedger('not-a-date')).rejects.toThrow(
      'Ledger projection time must be a valid timestamp'
    );
    expect(records.size).toBe(0);
    await createStore(records).projectLedger();
    const persistedProjection = await store.inspectLedger(at('00:00'));
    expect(persistedProjection.registryIds).toEqual(projection.registryIds);
    expect(persistedProjection.rows).toHaveLength(REGISTRY.length);
    const persisted = hotLedger(records);
    persisted.registryIds.pop();
    records.set(STORE_KEY, JSON.stringify(persisted));
    await expect(store.inspectLedger()).rejects.toBeInstanceOf(
      RegistryDriftError
    );
  });
  it('persists a fail-closed placeholder for every registry identity', async () => {
    const store = createStore();
    const result = await store.projectLedger(at('00:00'));
    expect(result.registryIds).toEqual(REGISTRY.map(entry => entry.id));
    expect(result.rows).toHaveLength(REGISTRY.length);
    expect(result.rows.every(row => row.packet.source === null)).toBe(true);
    expect(result.rows.every(row => row.admission.state === 'working')).toBe(
      true
    );
  });
  it('grows a persisted registry with fail-closed placeholders and preserves evidence', async () => {
    const records = new Map<string, string>();
    const backend = jsonbBackend(records);
    const original = new Store(backend, REGISTRY.slice(0, 1));
    const first = await original.ingestPacket(packet(FIRST), at('01:00'));
    await approve(original, FIRST, digest(first), at('01:01'));
    const before = JSON.parse(records.get(STORE_KEY)!);
    const expanded = new Store(backend, REGISTRY);
    const inspected = await expanded.inspectLedger(at('02:00'));
    expect(inspected.registryIds).toEqual(REGISTRY.map(entry => entry.id));
    expect(JSON.parse(records.get(STORE_KEY)!)).toEqual(before);
    const projection = await expanded.projectLedger(at('02:00'));
    expect(projection.rows[1]).toMatchObject({
      admission: { state: 'working' },
      decisions: [],
      packet: { source: null },
    });
    expect(JSON.parse(records.get(STORE_KEY)!).records[FIRST.id]).toEqual(
      before.records[FIRST.id]
    );
    await expect(
      expanded.ingestPacket(packet(SECOND), at('03:00'))
    ).resolves.toMatchObject({ identityId: SECOND.id });
    await expect(original.projectLedger()).rejects.toBeInstanceOf(
      RegistryDriftError
    );
  });
  it('retries registry growth against concurrent evidence without overwriting it', async () => {
    const records = new Map<string, unknown>();
    const backend = memoryBackend(records);
    const original = new Store(backend, REGISTRY.slice(0, 1));
    await original.projectLedger(at('00:00'));
    let raced = false;
    const expanded = new Store(
      {
        ...backend,
        async compareAndSet(key, expected, next, ttl) {
          if (!raced) {
            raced = true;
            await original.ingestPacket(packet(FIRST), at('01:00'));
            return false;
          }
          return backend.compareAndSet(key, expected, next, ttl);
        },
      },
      REGISTRY
    );
    const projection = await expanded.projectLedger(at('02:00'));
    expect(raced).toBe(true);
    expect(projection.rows[0].packet).toEqual(packet(FIRST));
    expect(projection.rows[1].packet.source).toBeNull();
  });
  it('reconciles registry growth before the first evidence ingest', async () => {
    const records = new Map<string, unknown>();
    const backend = memoryBackend(records);
    await new Store(backend, REGISTRY.slice(0, 1)).projectLedger(at('00:00'));
    await expect(
      new Store(backend, REGISTRY).ingestPacket(packet(SECOND), at('01:00'))
    ).resolves.toMatchObject({ identityId: SECOND.id });
  });
  it('does not repair corrupt records while extending the registry', async () => {
    const records = new Map<string, unknown>();
    const backend = memoryBackend(records);
    await new Store(backend, REGISTRY.slice(0, 1)).projectLedger();
    await new Store(backend, REGISTRY.slice(0, 1)).ingestPacket(
      packet(FIRST),
      at('00:00')
    );
    const shardKey = packetKey(records, FIRST.id);
    const shard = JSON.parse(records.get(shardKey) as string);
    shard.packet.subject.id = 'incorrect-identity';
    records.set(shardKey, JSON.stringify(shard));
    const projection = await new Store(backend, REGISTRY).projectLedger();
    const storedShard = JSON.parse(records.get(shardKey) as string);
    expect(storedShard.packet.subject.id).toBe('incorrect-identity');
    expect(
      storedShard.packetUpdatedAt ?? storedShard.evaluatedAt
    ).toBeDefined();
    const stored = hotLedger(records);
    expect(stored.registryIds).toEqual(REGISTRY.map(entry => entry.id));
    const failed = projection.entryOutcomes.find(
      outcome => outcome.identityId === FIRST.id
    );
    expect(failed?.evaluation).toBe('failed');
    expect(failed?.row.admission.state).toBe('working');
    expect(
      projection.entryOutcomes
        .filter(outcome => outcome.identityId !== FIRST.id)
        .every(outcome => outcome.evaluation === 'evaluated')
    ).toBe(true);
  });
  it('bounds registry extension contention without persisting partial additions', async () => {
    const records = new Map<string, unknown>();
    const backend = memoryBackend(records);
    await new Store(backend, REGISTRY.slice(0, 1)).projectLedger();
    const before = records.get(STORE_KEY);
    let attempts = 0;
    const store = new Store(
      {
        ...backend,
        async compareAndSet() {
          attempts += 1;
          return false;
        },
      },
      REGISTRY
    );
    await expect(store.projectLedger()).rejects.toThrow(
      'initialization lost compare-and-set repeatedly'
    );
    expect(attempts).toBe(5);
    expect(records.get(STORE_KEY)).toBe(before);
  });
  it('validates initialization and the exact registry denominator', async () => {
    const records = new Map<string, unknown>();
    const store = createStore(records);
    await expect(store.projectLedger('not-a-date')).rejects.toThrow(
      'Ledger projection time must be a valid timestamp'
    );
    expect(records.has(STORE_KEY)).toBe(false);
    expect(() => new Store(memoryBackend(), [FIRST, FIRST])).toThrow(
      RegistryDriftError
    );
    await store.projectLedger();
    const ledger = hotLedger(records);
    ledger.registryIds.push(FIRST.id);
    records.set(STORE_KEY, JSON.stringify(ledger));
    await expect(store.projectLedger()).rejects.toBeInstanceOf(
      RegistryDriftError
    );
  });
  it.each<CertificationEvidenceStatus>([
    'missing',
    'pending',
    'failed',
    'blocked',
  ])('never projects %s evidence as Review Ready', async status => {
    const store = createStore();
    const visualProof =
      status === 'missing'
        ? []
        : [proof('visual_proof', `${status}-visual`, status)];
    const row = await store.ingestPacket(
      packet(FIRST, { visualProof }),
      at('01:00')
    );
    expect(row.admission.state).toBe('working');
    await expect(ready(store)).resolves.toMatchObject({
      eligibleSubjectIds: [],
      selected: null,
    });
  });
  it('persists through a jsonb backend that returns the parsed ledger', async () => {
    const records = new Map<string, string>();
    const store = new Store(jsonbBackend(records), REGISTRY);
    await store.ingestPacket(packet(FIRST), at('02:00'));
    await store.ingestPacket(packet(SECOND), at('02:01'));
    const stored = [...records.values()][0];
    expect(typeof stored).toBe('string');
    const ledger = JSON.parse(stored ?? '{}');
    expect(ledger.records[FIRST.id].packetUpdatedAt).toBe(at('02:00'));
    expect(ledger.records[SECOND.id].packetUpdatedAt).toBe(at('02:01'));
    await expect(store.inspectLedger()).resolves.toMatchObject({
      contract: expect.any(String),
    });
  });
  it('selects deterministically at most one and preserves occupied Badge', async () => {
    const store = createStore();
    await store.ingestPacket(packet(FIRST), at('02:00'));
    await store.ingestPacket(packet(SECOND), at('02:01'));
    const open = await ready(store);
    expect(open.selected?.subject.id).toBe(FIRST.id);
    expect(open.eligibleSubjectIds).toEqual(REGISTRY.map(entry => entry.id));
    expect(open.withheld).toEqual([
      { reason: 'max_one_arbitration', subjectId: SECOND.id },
    ]);
    const occupied = await ready(
      store,
      ASSURANCE_PROFILES,
      'badge-semantic-tones'
    );
    expect(occupied.selected).toBeNull();
    expect(
      occupied.withheld.every(
        item => item.reason === 'existing_review_slot_occupied'
      )
    ).toBe(true);
  });
  it('withholds an unmapped identity while unrelated qualified work continues', async () => {
    const store = createStore();
    await store.ingestPacket(packet(FIRST), at('02:10'));
    await store.ingestPacket(packet(SECOND), at('02:11'));
    const result = await ready(store, [assuranceProfile(SECOND)]);
    expect(result.selected?.subject.id).toBe(SECOND.id);
    expect(result.eligibleSubjectIds).toEqual([SECOND.id]);
    expect(result.assurance).toMatchObject([
      {
        blockers: [{ code: 'assurance_profile_missing' }],
        status: 'unqualified',
        subjectId: FIRST.id,
      },
      { blockers: [], status: 'qualified', subjectId: SECOND.id },
    ]);
    expect(result.withheld).toContainEqual({
      reason: 'assurance_unqualified',
      subjectId: FIRST.id,
    });
  });
  it('fails closed for missing, failed, or mismatched named mandatory evidence', async () => {
    const entry = FIRST;
    const requirementId = `${entry.id}-landed-enforcement`;
    const evidenceId = `${entry.id}-landed-enforcement-receipt`;
    const profile = assuranceProfile(entry, {
      mandatory: [
        ...assuranceProfile(entry).mandatory,
        {
          evidence: binding('ci', evidenceId),
          id: requirementId,
          kind: 'landed_coverage_enforcement',
        },
      ],
    });
    const store = createStore(undefined, [entry]);
    const receipts = [
      null,
      proof('ci', evidenceId, 'failed'),
      { ...proof('ci', evidenceId), ref: 'github:wrong/run' },
    ];
    const codes = [
      'assurance_receipt_missing',
      'assurance_receipt_failed',
      'assurance_receipt_ref_mismatch',
    ];
    for (const [index, receipt] of receipts.entries()) {
      await store.ingestPacket(
        packetForProfile(
          entry,
          profile,
          receipt ? { operational: { ci: [receipt] } } : {}
        ),
        `2026-09-04T20:02:2${index}.000Z`
      );
      const result = await ready(store, [profile]);
      if (index === 0) expect(result.selected).toBeNull();
      expect(result.assurance[0].blockers).toMatchObject([
        { code: codes[index], requirementId },
      ]);
    }
  });
  it('keeps optional parity advisory and validates its complete economics', async () => {
    const entry = FIRST;
    const optionalParity = {
      desiredOutcome: 'Raise the public-page score from the floor to parity.',
      economics: {
        confidence: 'medium; measured after one representative route',
        displacedWork: 'named higher-value onboarding reliability slice',
        expectedRoi: 'bounded conversion and delivery-speed range',
        measuredTrigger: 'reassess when the score remains below 100 for 30d',
        totalOwnershipCost: 'implementation plus maintenance range',
      },
      id: `${entry.id}-optional-perfect-score`,
      publicPageScoreTarget: 100 as const,
    };
    const store = createStore(undefined, [entry]);
    const optionalProfile = assuranceProfile(entry, {
      optionalParity: [optionalParity],
    });
    await store.ingestPacket(
      packetForProfile(entry, optionalProfile),
      at('02:30')
    );
    const result = await ready(store, [optionalProfile]);
    expect(result.selected?.subject.id).toBe(entry.id);
    expect(result.assurance[0]).toMatchObject({
      blockers: [],
      optionalParity: [
        {
          requirementId: optionalParity.id,
          status: 'unproven',
        },
      ],
      status: 'qualified',
    });
    const invalid = assuranceProfile(entry, {
      optionalParity: [
        {
          ...optionalParity,
          economics: { ...optionalParity.economics, measuredTrigger: ' ' },
        },
      ],
    });
    await expect(ready(store, [invalid])).rejects.toBeInstanceOf(
      AssuranceError
    );
    const evidenceId = `${entry.id}-optional-parity-proof`;
    const evidencedProfile = assuranceProfile(entry, {
      optionalParity: [
        { ...optionalParity, evidence: binding('visual_proof', evidenceId) },
      ],
    });
    const evidencedStore = new Store(memoryBackend(), [entry]);
    const evidencedPacket = packetForProfile(entry, evidencedProfile);
    await evidencedStore.ingestPacket(
      {
        ...evidencedPacket,
        visualProof: [
          ...evidencedPacket.visualProof,
          proof('visual_proof', evidenceId),
        ],
      },
      at('02:31')
    );
    await expect(
      ready(evidencedStore, [evidencedProfile])
    ).resolves.toMatchObject({
      assurance: [{ optionalParity: [{ status: 'evidenced' }] }],
    });
  });
  it('requires one explicit disposition for every mandatory dimension', async () => {
    const entry = FIRST;
    const base = assuranceProfile(entry);
    const withoutSecurity = base.mandatory.filter(
      requirement => requirement.kind !== 'security'
    );
    const store = createStore(undefined, [entry]);
    await expect(
      ready(store, [{ ...base, mandatory: withoutSecurity, notApplicable: [] }])
    ).rejects.toThrow('dimension security');
    const notApplicableProfile = assuranceProfile(entry, {
      mandatory: withoutSecurity,
      notApplicable: [
        {
          dimension: 'security',
          rationale: 'No security boundary is present in this component.',
        },
      ],
    });
    await store.ingestPacket(
      packetForProfile(entry, notApplicableProfile),
      at('02:35')
    );
    await expect(ready(store, [notApplicableProfile])).resolves.toMatchObject({
      assurance: [{ blockers: [], status: 'qualified' }],
    });
  });
  it.each([
    [
      'invalid profile shape',
      {} as MarketingAssuranceProfile,
      'invalid runtime shape',
    ],
    [
      'invalid evidence binding',
      {
        ...FIRST_PROFILE,
        provenance: {
          ...FIRST_PROFILE.provenance,
          selector: ' ',
        },
      },
      'must name one receipt',
    ],
    [
      'non-canonical profile provenance',
      {
        ...FIRST_PROFILE,
        provenance: binding('tests_coverage', 'profile-from-tests'),
      },
      'canonical_references',
    ],
    [
      'unsupported mandatory kind',
      {
        ...FIRST_PROFILE,
        mandatory: [
          ...FIRST_PROFILE.mandatory,
          {
            evidence: binding('tests_coverage', 'invented-kind'),
            id: 'invented-kind',
            kind: 'invented',
          },
        ],
      } as unknown as MarketingAssuranceProfile,
      'supported kinds',
    ],
    [
      'duplicate requirement id',
      {
        ...FIRST_PROFILE,
        mandatory: [
          ...FIRST_PROFILE.mandatory,
          {
            evidence: binding('tests_coverage', 'duplicate-id-receipt'),
            id: `${FIRST.id}-security`,
            kind: 'written_invariant',
          },
        ],
      },
      'Duplicate assurance requirement id',
    ],
    [
      'reused mandatory receipt',
      {
        ...FIRST_PROFILE,
        mandatory: [
          ...FIRST_PROFILE.mandatory,
          {
            evidence: FIRST_PROFILE.mandatory[0].evidence,
            id: 'reused-receipt',
            kind: 'written_invariant',
          },
        ],
      },
      'cannot satisfy more than one requirement',
    ],
    [
      'floor on non-public requirement',
      {
        ...FIRST_PROFILE,
        mandatory: FIRST_PROFILE.mandatory.map(requirement =>
          requirement.kind === 'security'
            ? { ...requirement, publicPageScoreFloor: 97 }
            : requirement
        ),
      } as unknown as MarketingAssuranceProfile,
      'Only public_page_quality_floor',
    ],
    [
      'invalid not-applicable rationale',
      {
        ...FIRST_PROFILE,
        mandatory: FIRST_PROFILE.mandatory.filter(
          requirement => requirement.kind !== 'security'
        ),
        notApplicable: [{ dimension: 'security', rationale: ' ' }],
      },
      'require a supported dimension and rationale',
    ],
    [
      'invalid optional shape',
      {
        ...FIRST_PROFILE,
        optionalParity: [{}],
      } as unknown as MarketingAssuranceProfile,
      'need an id, desired outcome, and economics',
    ],
    [
      'duplicate optional id',
      {
        ...FIRST_PROFILE,
        optionalParity: [
          {
            ...OPTIONAL_PARITY,
            id: `${FIRST.id}-security`,
          },
        ],
      },
      'Duplicate assurance requirement id',
    ],
    [
      'invalid optional target',
      {
        ...FIRST_PROFILE,
        optionalParity: [
          {
            ...OPTIONAL_PARITY,
            id: 'optional-target',
            publicPageScoreTarget: 99,
          },
        ],
      } as unknown as MarketingAssuranceProfile,
      'approved 100-point target',
    ],
    [
      'reused optional receipt',
      {
        ...FIRST_PROFILE,
        optionalParity: [
          {
            ...OPTIONAL_PARITY,
            evidence: FIRST_PROFILE.mandatory[0].evidence,
            id: 'optional-reused-receipt',
          },
        ],
      },
      'cannot satisfy more than one requirement',
    ],
  ])(
    'rejects malformed assurance mapping: %s',
    async (_label, profile, error) => {
      const store = createStore(undefined, [FIRST]);
      await expect(
        ready(store, [profile as MarketingAssuranceProfile])
      ).rejects.toThrow(error);
    }
  );
  it('rejects ambiguous, stale-source, unknown, and duplicate assurance mappings', async () => {
    const entry = FIRST;
    const profile = assuranceProfile(entry);
    const duplicateReceiptPacket = packet(entry);
    const securityReceipt = duplicateReceiptPacket.canonicalReferences.find(
      receipt => receipt.id === `${entry.id}-assurance-security`
    )!;
    expect(
      evaluateMarketingAssurance(
        {
          ...duplicateReceiptPacket,
          canonicalReferences: [
            ...duplicateReceiptPacket.canonicalReferences,
            securityReceipt,
          ],
        },
        profile
      ).blockers
    ).toContainEqual(
      expect.objectContaining({ code: 'assurance_receipt_ambiguous' })
    );
    expect(
      evaluateMarketingAssurance(
        {
          ...duplicateReceiptPacket,
          canonicalReferences: duplicateReceiptPacket.canonicalReferences.map(
            receipt =>
              receipt.id === securityReceipt.id
                ? { ...receipt, sourceSha: 'b'.repeat(40) }
                : receipt
          ),
        },
        profile
      ).blockers
    ).toContainEqual(
      expect.objectContaining({ code: 'assurance_receipt_source_mismatch' })
    );
    expect(() =>
      evaluateMarketingAssurance(packet(entry), assuranceProfile(SECOND))
    ).toThrow('cannot evaluate');
    const store = createStore();
    await expect(
      ready(store, [{ ...profile, subjectId: 'unknown-marketing-identity' }])
    ).rejects.toBeInstanceOf(RegistryDriftError);
    await expect(ready(store, [profile, profile])).rejects.toThrow(
      'Duplicate assurance profile'
    );
  });
  it('binds the exact assurance profile content to its provenance receipt', async () => {
    const entry = FIRST;
    const profile = assuranceProfile(entry);
    const tamperedProfile = { ...profile, version: 'v2' };
    expect(() =>
      evaluateMarketingAssurance(packet(entry), tamperedProfile)
    ).toThrow('profile digest does not match');
    const mismatchedPacket = packet(entry);
    const provenanceIndex = mismatchedPacket.canonicalReferences.findIndex(
      receipt => receipt.id === profile.provenance.receiptId
    );
    const canonicalReferences = [...mismatchedPacket.canonicalReferences];
    canonicalReferences[provenanceIndex] = {
      ...canonicalReferences[provenanceIndex],
      digest: `sha256:${'f'.repeat(64)}`,
    };
    expect(
      evaluateMarketingAssurance(
        { ...mismatchedPacket, canonicalReferences },
        profile
      ).blockers
    ).toContainEqual(
      expect.objectContaining({ code: 'assurance_profile_digest_mismatch' })
    );
  });
  it('keeps the mandatory public-page floor distinct from optional 100', async () => {
    const entry = FIRST;
    const floorReceiptId = `${entry.id}-public-page-floor-97`;
    const profile = assuranceProfile(entry, {
      mandatory: [
        ...assuranceProfile(entry).mandatory,
        {
          evidence: binding('tests_coverage', floorReceiptId),
          id: `${entry.id}-public-page-floor`,
          kind: 'public_page_quality_floor',
          publicPageScoreFloor: 97,
        },
      ],
    });
    const store = createStore(undefined, [entry]);
    const base = packetForProfile(entry, profile);
    await store.ingestPacket(
      {
        ...base,
        testsCoverage: [
          ...base.testsCoverage,
          proof('tests_coverage', floorReceiptId),
        ],
      },
      at('02:40')
    );
    await expect(ready(store, [profile])).resolves.toMatchObject({
      assurance: [{ blockers: [], status: 'qualified' }],
    });
    const invalid = {
      ...profile,
      mandatory: profile.mandatory.map(requirement =>
        requirement.kind === 'public_page_quality_floor'
          ? { ...requirement, publicPageScoreFloor: 100 }
          : requirement
      ),
    } as unknown as MarketingAssuranceProfile;
    await expect(ready(store, [invalid])).rejects.toThrow(
      'approved 97-point floor'
    );
  });
  it('revalidates assurance before recording a founder decision', async () => {
    const entry = FIRST;
    const store = createStore(undefined, [entry]);
    const incomplete = packet(entry, {
      canonicalReferences: packet(entry).canonicalReferences.filter(
        receipt => receipt.id !== `${entry.id}-assurance-security`
      ),
    });
    const row = await store.ingestPacket(incomplete, at('02:50'));
    expect(row.admission.state).toBe('review_ready');
    await expect(
      approve(store, entry, digest(row), at('02:51'))
    ).resolves.toMatchObject({
      assurance: {
        blockers: [{ code: 'assurance_receipt_missing' }],
        status: 'unqualified',
      },
      ok: false,
      reason: 'assurance_unqualified',
    });
    expect((await store.projectLedger()).rows[0].decisions).toEqual([]);
  });
  it('persists founder decisions and rejects local or global replay', async () => {
    const store = createStore();
    const first = await store.ingestPacket(packet(FIRST), at('03:00'));
    const second = await store.ingestPacket(packet(SECOND), at('03:01'));
    const sharedId = 'decision-shared';
    await expect(
      approve(store, FIRST, digest(first), at('03:02'), sharedId)
    ).resolves.toMatchObject({ ok: true });
    await expect(
      approve(store, FIRST, digest(first), at('03:03'), 'decision-2')
    ).resolves.toMatchObject({
      ok: false,
      reason: 'duplicate_founder_decision',
    });
    await expect(
      approve(store, SECOND, digest(second), at('03:03'), sharedId)
    ).resolves.toMatchObject({
      ok: false,
      reason: 'duplicate_founder_decision',
    });
  });
  it('retries decisions against concurrent packets without stale taste locks', async () => {
    const records = new Map<string, unknown>();
    const writable = memoryBackend(records);
    const baseStore = new Store(writable, REGISTRY);
    const basePacket = packet(FIRST);
    const initial = await baseStore.ingestPacket(basePacket, at('04:00'));
    let race = true;
    const racing: Backend = {
      ...writable,
      async compareAndSet(key, expected, next, ttl) {
        if (race) {
          race = false;
          const concurrentPacket = packet(FIRST);
          await baseStore.ingestPacket(
            {
              ...concurrentPacket,
              visualProof: [
                ...concurrentPacket.visualProof,
                proof('visual_proof', 'new-taste'),
              ],
            },
            at('04:01')
          );
          return false;
        }
        return writable.compareAndSet(key, expected, next, ttl);
      },
    };
    const result = await new Store(racing, REGISTRY).recordFounderDecision({
      assuranceProfile: FIRST_PROFILE,
      decidedAt: at('04:02'),
      decision: decision(digest(initial)),
      subjectId: FIRST.id,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'decision_digest_mismatch',
    });
  });
  it('rejects stale packet CAS retries and keeps newer failed evidence', async () => {
    const records = new Map<string, unknown>();
    const writable = memoryBackend(records);
    const store = new Store(writable, REGISTRY);
    const current = packet(FIRST);
    await store.ingestPacket(current, at('05:00'));
    let race = true;
    const racing: Backend = {
      ...writable,
      async compareAndSet(key, expected, next, ttl) {
        if (race) {
          race = false;
          await store.ingestPacket(
            packet(FIRST, {
              testsCoverage: [
                proof('tests_coverage', 'newer-failure', 'failed'),
              ],
            }),
            at('05:02')
          );
          return false;
        }
        return writable.compareAndSet(key, expected, next, ttl);
      },
    };
    await expect(
      new Store(racing, REGISTRY).ingestPacket(
        packet(FIRST, {
          testsCoverage: [proof('tests_coverage', 'older-pass', 'passed')],
        }),
        at('05:01')
      )
    ).rejects.toThrow('is not newer than the persisted packet');
    const persisted = (await store.projectLedger()).rows[0];
    expect(persisted.packet.testsCoverage[0].status).toBe('failed');
    expect(persisted.admission.state).toBe('working');
  });
  it('commits concurrent packet revisions with their own hot stamps and audit events', async () => {
    const records = new Map<string, unknown>();
    const writable = memoryBackend(records);
    const store = createStore(records);
    await store.ingestPacket(packet(FIRST), at('05:00'));
    const olderAtShard = deferred();
    const newerAtShard = deferred();
    const releaseNewer = deferred();
    const olderAt = at('05:01');
    const newerAt = at('05:02');
    const racing = (at: string): Backend => {
      let intercepted = false;
      async function write(
        key: string,
        next: unknown,
        perform: () => Promise<boolean>
      ) {
        const isPacket = key.startsWith(SHARD_PREFIX);
        if (
          !isPacket ||
          intercepted ||
          JSON.parse(next as string).evaluatedAt !== at
        )
          return perform();
        intercepted = true;
        if (at === olderAt) {
          olderAtShard.resolve();
          await newerAtShard.promise;
          return perform();
        }
        const result = await perform();
        newerAtShard.resolve();
        await releaseNewer.promise;
        return result;
      }
      return {
        ...writable,
        compareAndSet: (key, expected, next, ttl) =>
          write(key, next, () =>
            writable.compareAndSet(key, expected, next, ttl)
          ),
        setIfAbsent: (key, value, ttl) =>
          write(key, value, () => writable.setIfAbsent(key, value, ttl)),
      };
    };
    const olderPacket = packet(FIRST, {
      testsCoverage: [proof('tests_coverage', 'older-pass')],
    });
    const newerPacket = packet(FIRST, {
      testsCoverage: [proof('tests_coverage', 'newer-failure', 'failed')],
    });
    const older = new Store(racing(olderAt), REGISTRY).ingestPacketWithOutcomes(
      olderPacket,
      olderAt
    );
    await olderAtShard.promise;
    const newer = new Store(racing(newerAt), REGISTRY).ingestPacketWithOutcomes(
      newerPacket,
      newerAt
    );
    await newerAtShard.promise;
    let olderResult: Awaited<typeof older>;
    try {
      olderResult = await older;
    } finally {
      releaseNewer.resolve();
    }
    const newerResult = await newer;
    expect(olderResult.row.packet).toEqual(olderPacket);
    expect(olderResult.row.packetUpdatedAt).toBe(olderAt);
    expect(newerResult.row.packet).toEqual(newerPacket);
    expect(newerResult.row.packetUpdatedAt).toBe(newerAt);
    const persisted = (await store.inspectLedger()).rows[0];
    expect(persisted.packet).toEqual(newerPacket);
    expect(persisted.packetUpdatedAt).toBe(newerAt);
    expect(persisted.admission.state).toBe('working');
    expect(hotLedger(records).records[FIRST.id].packetUpdatedAt).toBe(newerAt);
    const audit = await store.readAuditHistory(FIRST.id);
    expect(audit.some(event => event.at === olderAt)).toBe(true);
    expect(audit.some(event => event.at === newerAt)).toBe(true);
    expect(newerResult.entryOutcomes[0].row.auditHistory).toEqual(
      persisted.auditHistory
    );
  });
  it('compares packet timestamps numerically and validates mutation input', async () => {
    const store = createStore();
    const valid = packet(FIRST);
    const row = await store.ingestPacket(valid, at('06:00'));
    await expect(
      store.ingestPacket(valid, '2026-09-04T21:00:00+02:00')
    ).rejects.toThrow('is not newer than the persisted packet');
    await expect(store.ingestPacket(valid, 'invalid')).rejects.toThrow(
      'valid timestamp'
    );
    await expect(
      store.ingestPacket({
        ...valid,
        testsCoverage: [{ ...valid.testsCoverage[0], status: 'invented' }],
      } as unknown as Packet)
    ).rejects.toThrow('invalid runtime shape');
    await expect(approve(store, FIRST, digest(row), 'invalid')).rejects.toThrow(
      'valid timestamp'
    );
    await expect(
      approve(store, FIRST, digest(row), at('05:59'), '')
    ).rejects.toThrow(/invalid|predates/);
  });
  it('rejects source, identity, unknown, and unresolved input drift', async () => {
    const store = createStore();
    await expect(
      store.ingestPacket(
        packet(FIRST, {
          source: { ...packet(FIRST).source!, paths: ['wrong.tsx'] },
        })
      )
    ).rejects.toThrow('does not bind canonical source');
    await expect(
      store.ingestPacket(
        packet(FIRST, {
          subject: { ...packet(FIRST).subject, title: 'Spoofed' },
        })
      )
    ).rejects.toThrow('does not match its canonical registry identity');
    await expect(
      store.ingestPacket(
        packet(FIRST, {
          subject: { ...packet(FIRST).subject, id: 'unknown' },
        })
      )
    ).rejects.toThrow('Unknown marketing certification identity');
    const unresolved = MARKETING_COMPONENT_REGISTRY.find(
      entry => !entry.sourceBacked
    )!;
    const unresolvedStore = new Store(memoryBackend(), [unresolved]);
    const placeholder = (await unresolvedStore.projectLedger()).rows[0].packet;
    await expect(
      unresolvedStore.ingestPacket({
        ...placeholder,
        source: {
          paths: ['invented.tsx'],
          ref: 'main',
          repository: 'JovieInc/Jovie',
          sha: SHA,
        },
      })
    ).rejects.toThrow('has no resolved canonical source');
  });
  it('posts the rest of a ledger when one stored record cannot be evaluated', async () => {
    const records = new Map<string, unknown>();
    const store = createStore(records);
    await store.ingestPacket(packet(FIRST), at('10:00'));
    await store.ingestPacket(packet(SECOND), at('10:01'));
    const spoofedShardKey = packetKey(records, FIRST.id);
    const spoofedShard = JSON.parse(records.get(spoofedShardKey) as string);
    spoofedShard.packet.subject.title = 'Spoofed title';
    records.set(spoofedShardKey, JSON.stringify(spoofedShard));
    const posted = await store.ingestPacket(packet(SECOND), at('10:02'));
    expect(posted.identityId).toBe(SECOND.id);
    expect(posted.admission.state).not.toBe('working');
    const projection = await store.inspectLedger(at('10:03'));
    const failed = projection.entryOutcomes.find(
      outcome => outcome.identityId === FIRST.id
    );
    const sibling = projection.entryOutcomes.find(
      outcome => outcome.identityId === SECOND.id
    );
    expect(failed).toMatchObject({
      evaluation: 'failed',
      message: expect.stringContaining(FIRST.id),
    });
    expect(failed?.row.admission.state).toBe('working');
    expect(failed?.row.admission.blockers.length).toBeGreaterThan(0);
    expect(failed?.row.packet.subject.title).toBe(FIRST.storybookTitle);
    expect(sibling?.evaluation).toBe('evaluated');
    expect(sibling?.row.packet.source?.paths).toEqual([SECOND.resolvedSource]);
    const review = await ready(store);
    expect(review.eligibleSubjectIds).not.toContain(FIRST.id);
  });
  it('rebinds recipe.homepage onto its current source without certifying the stale packet', async () => {
    const homepage = MARKETING_COMPONENT_REGISTRY.find(
      entry => entry.id === 'recipe.homepage'
    );
    if (!homepage?.resolvedSource) {
      throw new Error('recipe.homepage must stay source-backed');
    }
    const sibling = FIRST;
    const registry = [homepage, sibling];
    const records = new Map<string, unknown>();
    const store = new Store(memoryBackend(records), registry);
    const admitted = await store.ingestPacket(packet(homepage), at('11:00'));
    await approve(
      store,
      homepage,
      digest(admitted),
      at('11:01'),
      'homepage-lock'
    );
    await store.ingestPacket(packet(sibling), at('11:02'));
    const stalePath =
      'apps/web/components/marketing/homepage-v2/HomepageV2Route.tsx';
    const shardKey = packetKey(records, homepage.id);
    const shard = JSON.parse(records.get(shardKey) as string);
    shard.packet.source.paths = [stalePath];
    const historical = JSON.stringify(shard);
    const hot = hotLedger(records);
    const revision = createHash('sha256').update(historical).digest('hex');
    hot.records[homepage.id].packetRevision = revision;
    records.set(`${SHARD_PREFIX}${homepage.id}:${revision}`, historical);
    records.set(STORE_KEY, JSON.stringify(hot));
    const beforeWrite = records.get(STORE_KEY);
    const viewed = await store.inspectLedger('2026-09-04T20:11:02.500Z');
    expect(records.get(STORE_KEY)).toBe(beforeWrite);
    const viewedHomepage = viewed.entryOutcomes.find(
      outcome => outcome.identityId === homepage.id
    );
    expect(viewedHomepage?.evaluation).toBe('evaluated');
    expect(viewedHomepage?.row.admission.state).toBe('working');
    expect(viewedHomepage?.row.packet.source?.paths).toEqual([
      homepage.resolvedSource,
    ]);
    const posted = await store.ingestPacket(packet(sibling), at('11:03'));
    expect(posted.identityId).toBe(sibling.id);
    const rebound = await store.inspectLedger(at('11:04'));
    const homepageRow = rebound.entryOutcomes.find(
      outcome => outcome.identityId === homepage.id
    );
    expect(homepageRow?.evaluation).toBe('evaluated');
    expect(homepageRow?.row.admission.state).toBe('working');
    expect(homepageRow?.row.admission.currentDecision).toBeNull();
    expect(homepageRow?.row.admission.baselineStatus).toBe(
      'candidate_pending_recertification'
    );
    expect(homepageRow?.row.decisions).toHaveLength(1);
    expect(homepageRow?.row.packet.source?.paths).toEqual([
      homepage.resolvedSource,
    ]);
    expect(homepageRow?.row.packet.source?.sha).toBe('0'.repeat(40));
    expect(homepageRow?.row.packet.canonicalReferences[0]).toMatchObject({
      status: 'failed',
      ref: homepage.resolvedSource,
    });
    expect(homepageRow?.row.packet.canonicalReferences[0]?.summary).toContain(
      stalePath
    );
    const storedShard = JSON.parse(
      records.get(packetKey(records, homepage.id)) as string
    );
    expect(storedShard.packet.source.paths).toEqual([homepage.resolvedSource]);
    const storedHot = hotLedger(records);
    expect(storedHot.records[homepage.id].packetUpdatedAt).toBe(at('11:00'));
    const recertified = await store.ingestPacket(packet(homepage), at('11:05'));
    expect(recertified.packet.source?.paths).toEqual([homepage.resolvedSource]);
    expect(recertified.packet.source?.sha).toBe(SHA);
    expect(recertified.admission.state).not.toBe('working');
    expect(
      recertified.packet.canonicalReferences.some(
        receipt => receipt.id === `${homepage.id}:canonical-source-drift`
      )
    ).toBe(false);
  });
  it.each([42, '{', '{}'] as const)(
    'fails closed for corrupt ledger %j',
    async raw => {
      const backend = memoryBackend(new Map([[STORE_KEY, raw]]));
      await expect(
        new Store(backend, REGISTRY).projectLedger()
      ).rejects.toBeInstanceOf(PersistenceError);
    }
  );
  it('rejects persisted decision, audit, and replay corruption', async () => {
    for (const corruption of ['decision', 'audit', 'replay'] as const) {
      const records = new Map<string, unknown>();
      const store = createStore(records);
      const admitted = await store.ingestPacket(packet(FIRST), at('07:00'));
      await approve(store, FIRST, digest(admitted), at('07:01'));
      const ledger = hotLedger(records);
      if (corruption === 'decision')
        ledger.records[FIRST.id].decisions[0].subjectId = SECOND.id;
      if (corruption === 'audit')
        ledger.records[FIRST.id].auditHistory[0].subjectId = SECOND.id;
      if (corruption === 'replay')
        ledger.records[SECOND.id].decisions = [
          {
            ...ledger.records[FIRST.id].decisions[0],
            subjectId: SECOND.id,
          },
        ];
      records.set(STORE_KEY, JSON.stringify(ledger));
      await expect(store.projectLedger()).rejects.toBeInstanceOf(
        PersistenceError
      );
    }
  });
  it('preserves a taste lock while operational evidence advances', async () => {
    const store = createStore();
    const base = packet(FIRST);
    const admitted = await store.ingestPacket(base, at('08:00'));
    await approve(store, FIRST, digest(admitted), at('08:01'));
    const operational = await store.ingestPacket(
      {
        ...base,
        operational: {
          ci: [proof('ci', 'ci')],
          deploy: [proof('deploy', 'deploy')],
          queueMerge: [proof('queue_merge', 'queue')],
          runtimeDogfood: [proof('runtime_dogfood', 'runtime')],
        },
      },
      at('08:02')
    );
    expect(operational.admission.state).toBe('monitored');
    expect(operational.admission.currentDecision?.id).toBe('decision-1');
  });
  it('bounds initialization and update contention', async () => {
    const neverInitializes: Backend = {
      async compareAndSet() {
        return false;
      },
      async get() {
        return null;
      },
      async setIfAbsent() {
        return false;
      },
    };
    await expect(
      new Store(neverInitializes, REGISTRY).projectLedger()
    ).rejects.toThrow('initialization lost compare-and-set repeatedly');
    const records = new Map<string, unknown>();
    const seed = createStore(records);
    await seed.projectLedger(at('09:00'));
    const neverUpdates: Backend = {
      async compareAndSet() {
        return false;
      },
      async get(key) {
        return records.get(key);
      },
      setIfAbsent: memoryBackend(records).setIfAbsent,
    };
    await expect(
      new Store(neverUpdates, REGISTRY).ingestPacket(packet(FIRST), at('09:01'))
    ).rejects.toThrow(/lost compare-and-set repeatedly/);
  });
  it('moves old audit events to append-only chunks without losing any, and keeps the ledger row small', async () => {
    const records = new Map<string, unknown>();
    const store = createStore(records);
    const id = FIRST.id;
    await store.ingestPacket(packet(FIRST), at('00:00'));
    const seeded = hotLedger(records);
    const event = seeded.records[id].auditHistory[0];
    expect(event).toBeDefined();
    seeded.records[id].auditHistory = Array.from({ length: 600 }, () => event);
    records.set(STORE_KEY, JSON.stringify(seeded));
    await store.ingestPacket(
      packet(FIRST, {
        testsCoverage: [proof('tests_coverage', 'changed', 'failed')],
      }),
      at('01:00')
    );
    const hot = hotLedger(records);
    expect(hot.records[id].auditArchiveChunks).toBe(1);
    expect(hot.records[id].auditHistory.length).toBeLessThanOrEqual(
      HOT_AUDIT_LIMIT + 5
    );
    expect(records.has(`${AUDIT_PREFIX}:${id}:0`)).toBe(true);
    const full = await store.readAuditHistory(id);
    expect(full.length).toBeGreaterThanOrEqual(601);
    expect(Buffer.byteLength(records.get(STORE_KEY) as string)).toBeLessThan(
      ROW_BUDGET_BYTES
    );
  });
  it('does not rewrite the ledger when a re-posted packet means the same thing', async () => {
    const records = new Map<string, unknown>();
    const store = createStore(records);
    await store.ingestPacket(packet(FIRST), at('00:00'));
    const before = records.get(STORE_KEY);
    await store.ingestPacket(packet(FIRST), at('05:00'));
    expect(records.get(STORE_KEY)).toBe(before);
  });
  it.each(['get', 'batch'])(
    'fails closed for malformed shards with %s backend capability',
    async mode => {
      for (const corruption of [
        'missing',
        'json',
        'packet',
        'identity',
        'time',
        'stamp',
        'hash',
        'inline',
        'inline-empty',
      ]) {
        const records = new Map<string, unknown>();
        const backend = memoryBackend(records);
        if (mode === 'batch') {
          backend.getMany = async keys =>
            new Map(keys.map(key => [key, records.get(key)]));
          const get = backend.get;
          backend.get = async key => {
            expect(key.startsWith(SHARD_PREFIX)).toBe(false);
            return get(key);
          };
        }
        const store = new Store(backend, REGISTRY);
        await store.ingestPacket(packet(FIRST), at('00:00'));
        await store.ingestPacket(packet(SECOND), at('00:01'));
        const key = packetKey(records, FIRST.id);
        const shard = JSON.parse(records.get(key) as string);
        if (corruption === 'packet') shard.packet.testsCoverage = 'invalid';
        if (corruption === 'identity') shard.identityId = SECOND.id;
        if (corruption === 'time') shard.evaluatedAt = 'invalid';
        if (corruption === 'stamp') shard.evaluatedAt = at('00:02');
        if (corruption === 'hash')
          shard.packet.visualProof[0].summary = 'tampered';
        records.set(key, corruption === 'json' ? '{' : JSON.stringify(shard));
        if (corruption === 'missing') records.delete(key);
        if (corruption.startsWith('inline')) {
          const legacy = hotLedger(records);
          legacy.records[FIRST.id].packet = {
            ...packet(FIRST),
            visualProof: {},
          };
          if (corruption === 'inline-empty') {
            legacy.records[FIRST.id].auditHistory = [];
            delete legacy.records[FIRST.id].packetRevision;
          }
          records.set(STORE_KEY, JSON.stringify(legacy));
        }
        const hot = records.get(STORE_KEY);
        const projected = await store.inspectLedger();
        expect(records.get(STORE_KEY)).toBe(hot);
        expect(projected.rows[0].admission.state).toBe('working');
        expect(projected.rows[0].admission.blockers.length).toBeGreaterThan(0);
        expect(projected.rows[1].packet).toEqual(packet(SECOND));
        expect((await ready(store)).eligibleSubjectIds).not.toContain(FIRST.id);
        await store.ingestPacket(packet(SECOND), at('00:02'));
        expect((await store.inspectLedger()).entryOutcomes[0].evaluation).toBe(
          'failed'
        );
        const repaired = await store.ingestPacket(packet(FIRST), at('00:03'));
        expect(repaired.packet).toEqual(packet(FIRST));
        expect(repaired.admission.state).toBe('review_ready');
        expect((await store.inspectLedger()).entryOutcomes[0].evaluation).toBe(
          'evaluated'
        );
      }
    }
  );
  it('does not certify an uncommitted legacy shard matching initialization time', async () => {
    const records = new Map<string, unknown>();
    const store = createStore(records);
    await store.projectLedger(at('00:00'));
    records.set(
      `${SHARD_PREFIX}${FIRST.id}`,
      JSON.stringify({
        schema: SHARD_SCHEMA,
        identityId: FIRST.id,
        evaluatedAt: at('00:00'),
        packet: packet(FIRST),
      })
    );
    const before = new Map(records);
    const projected = await store.inspectLedger();
    expect(projected.rows[0].packet.source).toBeNull();
    expect(projected.rows[0].admission.state).toBe('working');
    expect(projected.rows[0].auditHistory).toEqual([]);
    expect(records).toEqual(before);
    expect(
      (await store.ingestPacket(packet(FIRST), at('00:01'))).packet
    ).toEqual(packet(FIRST));
  });
  it('accepts the exact hot budget, rejects one byte more, and recovers via audit compaction', async () => {
    const records = new Map<string, unknown>();
    const store = createStore(records);
    await store.ingestPacket(packet(FIRST), at('00:00'));
    const hot = hotLedger(records);
    const record = hot.records[FIRST.id];
    record.auditHistory = Array.from({ length: 41 }, () => ({
      ...record.auditHistory[0],
      summary: '',
    }));
    record.auditHistory[0].summary = 'x'.repeat(
      ROW_BUDGET_BYTES - Buffer.byteLength(JSON.stringify(hot))
    );
    records.set(STORE_KEY, JSON.stringify(hot));
    expect(Buffer.byteLength(records.get(STORE_KEY) as string)).toBe(
      ROW_BUDGET_BYTES
    );
    await expect(
      store.ingestPacket(packet(FIRST), at('00:01'))
    ).resolves.toMatchObject({ packetUpdatedAt: at('00:00') });
    record.auditHistory[0].summary += 'x';
    const oversized = JSON.stringify(hot);
    records.set(STORE_KEY, oversized);
    await expect(
      store.ingestPacket(packet(FIRST), at('00:01'))
    ).rejects.toThrow(/budget|bytes|size/i);
    expect(records.get(STORE_KEY)).toBe(oversized);
    await store.compactAudit();
    expect(Buffer.byteLength(records.get(STORE_KEY) as string)).toBeLessThan(
      ROW_BUDGET_BYTES
    );
    expect(await store.readAuditHistory(FIRST.id)).toHaveLength(41);
    expect((await store.inspectLedger()).rows[0].packet).toEqual(packet(FIRST));
  });
  it('accepts an exact UTF-8 shard budget and rejects one byte more before committing', async () => {
    const records = new Map<string, unknown>();
    const store = createStore(records);
    const evaluatedAt = at('00:00');
    const base = packet(FIRST, {
      visualProof: [
        { ...proof('visual_proof', 'dogfood-judge:budget'), summary: '' },
      ],
    });
    const emptySize = Buffer.byteLength(
      JSON.stringify({
        schema: SHARD_SCHEMA,
        identityId: FIRST.id,
        evaluatedAt,
        packet: base,
      })
    );
    const available = ROW_BUDGET_BYTES - emptySize;
    const summary = `${'é'.repeat(Math.floor(available / 2))}${'x'.repeat(available % 2)}`;
    const bounded = {
      ...base,
      visualProof: [{ ...base.visualProof[0], summary }],
    };
    await store.ingestPacket(bounded, evaluatedAt);
    expect(
      Buffer.byteLength(records.get(packetKey(records, FIRST.id)) as string)
    ).toBe(ROW_BUDGET_BYTES);
    const before = new Map(records);
    await expect(
      store.ingestPacket(
        {
          ...base,
          visualProof: [{ ...base.visualProof[0], summary: `${summary}x` }],
        },
        at('00:01')
      )
    ).rejects.toThrow(/budget|bytes|size/i);
    expect(records).toEqual(before);
  });
  it('keeps the hot ledger row under the KV row budget when stored packets are large (JOV-12830)', async () => {
    const records = new Map<string, unknown>();
    const store = createStore(records);
    const fatReceipts = Array.from({ length: 550 }, (_, i) =>
      proof('visual_proof', `jov-12830-fat-${i}`)
    );
    for (const [i, entry] of REGISTRY.entries()) {
      await store.ingestPacket(
        packet(entry, { visualProof: fatReceipts }),
        `2026-11-16T20:0${i}:00.000Z`
      );
    }
    const hot = hotLedger(records);
    for (const [_i, entry] of REGISTRY.entries()) {
      const shardKey = packetKey(records, entry.id);
      const shard = JSON.parse(records.get(shardKey) as string);
      hot.records[entry.id].packet = shard.packet;
      delete hot.records[entry.id].packetRevision;
      records.delete(shardKey);
    }
    records.set(STORE_KEY, JSON.stringify(hot));
    expect(Buffer.byteLength(records.get(STORE_KEY) as string)).toBeGreaterThan(
      ROW_BUDGET_BYTES
    );
    await store.ingestPacket(
      packet(FIRST, {
        testsCoverage: [proof('tests_coverage', 'jov-12830-new', 'failed')],
      }),
      '2026-11-16T21:00:00.000Z'
    );
    expect(Buffer.byteLength(records.get(STORE_KEY) as string)).toBeLessThan(
      ROW_BUDGET_BYTES
    );
    const view = await store.inspectLedger('2026-11-16T21:00:01.000Z');
    const reingested = view.entryOutcomes.find(
      candidate => candidate.identityId === FIRST.id
    );
    expect(reingested?.evaluation).toBe('evaluated');
    expect(
      reingested?.row.packet.testsCoverage?.some(r => r.id === 'jov-12830-new')
    ).toBe(true);
    const sibling = view.entryOutcomes.find(
      candidate => candidate.identityId === SECOND.id
    );
    expect(sibling?.evaluation).toBe('evaluated');
    expect(sibling?.row.packet.visualProof?.length).toBe(fatReceipts.length);
    expect((await store.readAuditHistory(FIRST.id)).length).toBeGreaterThan(0);
  });
});
