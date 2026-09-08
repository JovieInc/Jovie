import { describe, expect, it } from 'vitest';
import {
  MARKETING_COMPONENT_REGISTRY,
  type MarketingRegistryEntry,
} from '@/data/marketing/componentRegistry';
import type {
  CertificationEvidenceReceipt,
  CertificationEvidenceStatus,
  CertificationReviewPacket,
} from '@/lib/agent-os/certification';
import {
  buildMarketingAssuranceProfileDigest,
  type CertificationRecordBackend,
  evaluateMarketingAssurance,
  MARKETING_CERTIFICATION_STORE_KEY,
  type MarketingAssuranceEvidenceBinding,
  type MarketingAssuranceProfile,
  MarketingCertificationAssuranceError,
  MarketingCertificationPersistenceError,
  MarketingCertificationRegistryDriftError,
  MarketingCertificationStore,
} from '@/lib/agent-os/certification-adapter';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const REGISTRY = MARKETING_COMPONENT_REGISTRY.filter(
  entry => entry.sourceBacked
).slice(0, 2);

function memoryBackend(
  records = new Map<string, unknown>()
): CertificationRecordBackend {
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
    mandatory: [
      {
        evidence: binding(
          'canonical_references',
          `${entry.id}-assurance-security`
        ),
        id: `${entry.id}-security`,
        kind: 'security',
      },
      {
        evidence: binding(
          'invariant_evaluation',
          `${entry.id}-assurance-integrity`
        ),
        id: `${entry.id}-integrity`,
        kind: 'integrity',
      },
      {
        evidence: binding(
          'visual_proof',
          `${entry.id}-assurance-accessibility`
        ),
        id: `${entry.id}-accessibility`,
        kind: 'accessibility',
      },
      {
        evidence: binding(
          'tests_coverage',
          `${entry.id}-assurance-correctness`
        ),
        id: `${entry.id}-correctness`,
        kind: 'correctness',
      },
    ],
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
  overrides: Partial<CertificationReviewPacket> = {}
): CertificationReviewPacket {
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

function packet(
  entry: MarketingRegistryEntry,
  overrides: Partial<CertificationReviewPacket> = {}
): CertificationReviewPacket {
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
      proof('visual_proof', `${entry.id}-visual`),
      proof('visual_proof', `${entry.id}-assurance-accessibility`),
    ],
    ...overrides,
  };
}

function decision(digest: string, id = 'decision-1') {
  return {
    decision: 'approved' as const,
    evidenceDigest: digest,
    id,
    notes: null,
    reviewer: 'Tim White',
  };
}

describe('MarketingCertificationStore', () => {
  it('persists a fail-closed placeholder for every registry identity', async () => {
    const store = new MarketingCertificationStore(memoryBackend(), REGISTRY);
    const result = await store.projectLedger('2026-09-04T20:00:00.000Z');

    expect(result.registryIds).toEqual(REGISTRY.map(entry => entry.id));
    expect(result.rows).toHaveLength(REGISTRY.length);
    expect(result.rows.every(row => row.packet.source === null)).toBe(true);
    expect(result.rows.every(row => row.admission.state === 'working')).toBe(
      true
    );
  });

  it('validates initialization and the exact registry denominator', async () => {
    const records = new Map<string, unknown>();
    const store = new MarketingCertificationStore(
      memoryBackend(records),
      REGISTRY
    );
    await expect(store.projectLedger('not-a-date')).rejects.toThrow(
      'Ledger projection time must be a valid timestamp'
    );
    expect(records.has(MARKETING_CERTIFICATION_STORE_KEY)).toBe(false);
    expect(
      () =>
        new MarketingCertificationStore(memoryBackend(), [
          REGISTRY[0],
          REGISTRY[0],
        ])
    ).toThrow(MarketingCertificationRegistryDriftError);

    await store.projectLedger();
    const ledger = JSON.parse(
      records.get(MARKETING_CERTIFICATION_STORE_KEY) as string
    );
    ledger.registryIds.push(REGISTRY[0].id);
    records.set(MARKETING_CERTIFICATION_STORE_KEY, JSON.stringify(ledger));
    await expect(store.projectLedger()).rejects.toBeInstanceOf(
      MarketingCertificationRegistryDriftError
    );
  });

  it.each<CertificationEvidenceStatus>([
    'missing',
    'pending',
    'failed',
    'blocked',
  ])('never projects %s evidence as Review Ready', async status => {
    const store = new MarketingCertificationStore(memoryBackend(), REGISTRY);
    const visualProof =
      status === 'missing'
        ? []
        : [proof('visual_proof', `${status}-visual`, status)];
    const row = await store.ingestPacket(
      packet(REGISTRY[0], { visualProof }),
      '2026-09-04T20:01:00.000Z'
    );

    expect(row.admission.state).toBe('working');
    await expect(
      store.projectReviewReady({
        assuranceProfiles: ASSURANCE_PROFILES,
        existingEntryId: null,
      })
    ).resolves.toMatchObject({ eligibleSubjectIds: [], selected: null });
  });

  it('selects deterministically at most one and preserves occupied Badge', async () => {
    const store = new MarketingCertificationStore(memoryBackend(), REGISTRY);
    await store.ingestPacket(packet(REGISTRY[0]), '2026-09-04T20:02:00.000Z');
    await store.ingestPacket(packet(REGISTRY[1]), '2026-09-04T20:02:01.000Z');

    const open = await store.projectReviewReady({
      assuranceProfiles: ASSURANCE_PROFILES,
      existingEntryId: null,
    });
    expect(open.selected?.subject.id).toBe(REGISTRY[0].id);
    expect(open.eligibleSubjectIds).toEqual(REGISTRY.map(entry => entry.id));
    expect(open.withheld).toEqual([
      { reason: 'max_one_arbitration', subjectId: REGISTRY[1].id },
    ]);

    const occupied = await store.projectReviewReady({
      assuranceProfiles: ASSURANCE_PROFILES,
      existingEntryId: 'badge-semantic-tones',
    });
    expect(occupied.selected).toBeNull();
    expect(
      occupied.withheld.every(
        item => item.reason === 'existing_review_slot_occupied'
      )
    ).toBe(true);
  });

  it('withholds an unmapped identity while unrelated qualified work continues', async () => {
    const store = new MarketingCertificationStore(memoryBackend(), REGISTRY);
    await store.ingestPacket(packet(REGISTRY[0]), '2026-09-04T20:02:10.000Z');
    await store.ingestPacket(packet(REGISTRY[1]), '2026-09-04T20:02:11.000Z');

    const result = await store.projectReviewReady({
      assuranceProfiles: [assuranceProfile(REGISTRY[1])],
      existingEntryId: null,
    });

    expect(result.selected?.subject.id).toBe(REGISTRY[1].id);
    expect(result.eligibleSubjectIds).toEqual([REGISTRY[1].id]);
    expect(result.assurance).toMatchObject([
      {
        blockers: [{ code: 'assurance_profile_missing' }],
        status: 'unqualified',
        subjectId: REGISTRY[0].id,
      },
      { blockers: [], status: 'qualified', subjectId: REGISTRY[1].id },
    ]);
    expect(result.withheld).toContainEqual({
      reason: 'assurance_unqualified',
      subjectId: REGISTRY[0].id,
    });
  });

  it('fails closed for missing, failed, or mismatched named mandatory evidence', async () => {
    const entry = REGISTRY[0];
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
    const store = new MarketingCertificationStore(memoryBackend(), [entry]);
    await store.ingestPacket(
      packetForProfile(entry, profile),
      '2026-09-04T20:02:20.000Z'
    );

    const missing = await store.projectReviewReady({
      assuranceProfiles: [profile],
      existingEntryId: null,
    });
    expect(missing.selected).toBeNull();
    expect(missing.assurance[0].blockers).toMatchObject([
      { code: 'assurance_receipt_missing', requirementId },
    ]);

    await store.ingestPacket(
      packetForProfile(entry, profile, {
        operational: { ci: [proof('ci', evidenceId, 'failed')] },
      }),
      '2026-09-04T20:02:21.000Z'
    );
    const failed = await store.projectReviewReady({
      assuranceProfiles: [profile],
      existingEntryId: null,
    });
    expect(failed.assurance[0].blockers).toMatchObject([
      { code: 'assurance_receipt_failed', requirementId },
    ]);

    await store.ingestPacket(
      packetForProfile(entry, profile, {
        operational: {
          ci: [{ ...proof('ci', evidenceId), ref: 'github:wrong/run' }],
        },
      }),
      '2026-09-04T20:02:22.000Z'
    );
    const mismatched = await store.projectReviewReady({
      assuranceProfiles: [profile],
      existingEntryId: null,
    });
    expect(mismatched.assurance[0].blockers).toMatchObject([
      { code: 'assurance_receipt_ref_mismatch', requirementId },
    ]);
  });

  it('keeps optional parity advisory and validates its complete economics', async () => {
    const entry = REGISTRY[0];
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
    const store = new MarketingCertificationStore(memoryBackend(), [entry]);
    const optionalProfile = assuranceProfile(entry, {
      optionalParity: [optionalParity],
    });
    await store.ingestPacket(
      packetForProfile(entry, optionalProfile),
      '2026-09-04T20:02:30.000Z'
    );

    const result = await store.projectReviewReady({
      assuranceProfiles: [optionalProfile],
      existingEntryId: null,
    });
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
    await expect(
      store.projectReviewReady({
        assuranceProfiles: [invalid],
        existingEntryId: null,
      })
    ).rejects.toBeInstanceOf(MarketingCertificationAssuranceError);

    const evidenceId = `${entry.id}-optional-parity-proof`;
    const evidencedProfile = assuranceProfile(entry, {
      optionalParity: [
        { ...optionalParity, evidence: binding('visual_proof', evidenceId) },
      ],
    });
    const evidencedStore = new MarketingCertificationStore(memoryBackend(), [
      entry,
    ]);
    const evidencedPacket = packetForProfile(entry, evidencedProfile);
    await evidencedStore.ingestPacket(
      {
        ...evidencedPacket,
        visualProof: [
          ...evidencedPacket.visualProof,
          proof('visual_proof', evidenceId),
        ],
      },
      '2026-09-04T20:02:31.000Z'
    );
    await expect(
      evidencedStore.projectReviewReady({
        assuranceProfiles: [evidencedProfile],
        existingEntryId: null,
      })
    ).resolves.toMatchObject({
      assurance: [{ optionalParity: [{ status: 'evidenced' }] }],
    });
  });

  it('requires one explicit disposition for every mandatory dimension', async () => {
    const entry = REGISTRY[0];
    const base = assuranceProfile(entry);
    const withoutSecurity = base.mandatory.filter(
      requirement => requirement.kind !== 'security'
    );
    const store = new MarketingCertificationStore(memoryBackend(), [entry]);
    await expect(
      store.projectReviewReady({
        assuranceProfiles: [
          { ...base, mandatory: withoutSecurity, notApplicable: [] },
        ],
        existingEntryId: null,
      })
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
      '2026-09-04T20:02:35.000Z'
    );
    await expect(
      store.projectReviewReady({
        assuranceProfiles: [notApplicableProfile],
        existingEntryId: null,
      })
    ).resolves.toMatchObject({
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
        ...assuranceProfile(REGISTRY[0]),
        provenance: {
          ...assuranceProfile(REGISTRY[0]).provenance,
          selector: ' ',
        },
      },
      'must name one receipt',
    ],
    [
      'non-canonical profile provenance',
      {
        ...assuranceProfile(REGISTRY[0]),
        provenance: binding('tests_coverage', 'profile-from-tests'),
      },
      'canonical_references',
    ],
    [
      'unsupported mandatory kind',
      {
        ...assuranceProfile(REGISTRY[0]),
        mandatory: [
          ...assuranceProfile(REGISTRY[0]).mandatory,
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
        ...assuranceProfile(REGISTRY[0]),
        mandatory: [
          ...assuranceProfile(REGISTRY[0]).mandatory,
          {
            evidence: binding('tests_coverage', 'duplicate-id-receipt'),
            id: `${REGISTRY[0].id}-security`,
            kind: 'written_invariant',
          },
        ],
      },
      'Duplicate assurance requirement id',
    ],
    [
      'reused mandatory receipt',
      {
        ...assuranceProfile(REGISTRY[0]),
        mandatory: [
          ...assuranceProfile(REGISTRY[0]).mandatory,
          {
            evidence: assuranceProfile(REGISTRY[0]).mandatory[0].evidence,
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
        ...assuranceProfile(REGISTRY[0]),
        mandatory: assuranceProfile(REGISTRY[0]).mandatory.map(requirement =>
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
        ...assuranceProfile(REGISTRY[0]),
        mandatory: assuranceProfile(REGISTRY[0]).mandatory.filter(
          requirement => requirement.kind !== 'security'
        ),
        notApplicable: [{ dimension: 'security', rationale: ' ' }],
      },
      'require a supported dimension and rationale',
    ],
    [
      'invalid optional shape',
      {
        ...assuranceProfile(REGISTRY[0]),
        optionalParity: [{}],
      } as unknown as MarketingAssuranceProfile,
      'need an id, desired outcome, and economics',
    ],
    [
      'duplicate optional id',
      {
        ...assuranceProfile(REGISTRY[0]),
        optionalParity: [
          {
            desiredOutcome: 'Optional outcome',
            economics: {
              confidence: 'medium',
              displacedWork: 'other work',
              expectedRoi: 'bounded',
              measuredTrigger: 'measured signal',
              totalOwnershipCost: 'bounded',
            },
            id: `${REGISTRY[0].id}-security`,
          },
        ],
      },
      'Duplicate assurance requirement id',
    ],
    [
      'invalid optional target',
      {
        ...assuranceProfile(REGISTRY[0]),
        optionalParity: [
          {
            desiredOutcome: 'Optional outcome',
            economics: {
              confidence: 'medium',
              displacedWork: 'other work',
              expectedRoi: 'bounded',
              measuredTrigger: 'measured signal',
              totalOwnershipCost: 'bounded',
            },
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
        ...assuranceProfile(REGISTRY[0]),
        optionalParity: [
          {
            desiredOutcome: 'Optional outcome',
            economics: {
              confidence: 'medium',
              displacedWork: 'other work',
              expectedRoi: 'bounded',
              measuredTrigger: 'measured signal',
              totalOwnershipCost: 'bounded',
            },
            evidence: assuranceProfile(REGISTRY[0]).mandatory[0].evidence,
            id: 'optional-reused-receipt',
          },
        ],
      },
      'cannot satisfy more than one requirement',
    ],
  ])('rejects malformed assurance mapping: %s', async (_label, profile, error) => {
    const store = new MarketingCertificationStore(memoryBackend(), [
      REGISTRY[0],
    ]);
    await expect(
      store.projectReviewReady({
        assuranceProfiles: [profile as MarketingAssuranceProfile],
        existingEntryId: null,
      })
    ).rejects.toThrow(error);
  });

  it('rejects ambiguous, stale-source, unknown, and duplicate assurance mappings', async () => {
    const entry = REGISTRY[0];
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
      evaluateMarketingAssurance(packet(entry), assuranceProfile(REGISTRY[1]))
    ).toThrow('cannot evaluate');

    const store = new MarketingCertificationStore(memoryBackend(), REGISTRY);
    await expect(
      store.projectReviewReady({
        assuranceProfiles: [
          { ...profile, subjectId: 'unknown-marketing-identity' },
        ],
        existingEntryId: null,
      })
    ).rejects.toBeInstanceOf(MarketingCertificationRegistryDriftError);
    await expect(
      store.projectReviewReady({
        assuranceProfiles: [profile, profile],
        existingEntryId: null,
      })
    ).rejects.toThrow('Duplicate assurance profile');
  });

  it('binds the exact assurance profile content to its provenance receipt', async () => {
    const entry = REGISTRY[0];
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
    const entry = REGISTRY[0];
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
    const store = new MarketingCertificationStore(memoryBackend(), [entry]);
    const base = packetForProfile(entry, profile);
    await store.ingestPacket(
      {
        ...base,
        testsCoverage: [
          ...base.testsCoverage,
          proof('tests_coverage', floorReceiptId),
        ],
      },
      '2026-09-04T20:02:40.000Z'
    );
    await expect(
      store.projectReviewReady({
        assuranceProfiles: [profile],
        existingEntryId: null,
      })
    ).resolves.toMatchObject({
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
    await expect(
      store.projectReviewReady({
        assuranceProfiles: [invalid],
        existingEntryId: null,
      })
    ).rejects.toThrow('approved 97-point floor');
  });

  it('revalidates assurance before recording a founder decision', async () => {
    const entry = REGISTRY[0];
    const store = new MarketingCertificationStore(memoryBackend(), [entry]);
    const incomplete = packet(entry, {
      canonicalReferences: packet(entry).canonicalReferences.filter(
        receipt => receipt.id !== `${entry.id}-assurance-security`
      ),
    });
    const row = await store.ingestPacket(
      incomplete,
      '2026-09-04T20:02:50.000Z'
    );
    expect(row.admission.state).toBe('review_ready');

    await expect(
      store.recordFounderDecision({
        assuranceProfile: assuranceProfile(entry),
        decidedAt: '2026-09-04T20:02:51.000Z',
        decision: decision(row.admission.decisionEvidenceDigest!),
        subjectId: entry.id,
      })
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
    const store = new MarketingCertificationStore(memoryBackend(), REGISTRY);
    const first = await store.ingestPacket(
      packet(REGISTRY[0]),
      '2026-09-04T20:03:00.000Z'
    );
    const second = await store.ingestPacket(
      packet(REGISTRY[1]),
      '2026-09-04T20:03:01.000Z'
    );
    const sharedId = 'decision-shared';
    await expect(
      store.recordFounderDecision({
        assuranceProfile: assuranceProfile(REGISTRY[0]),
        decidedAt: '2026-09-04T20:03:02.000Z',
        decision: decision(first.admission.decisionEvidenceDigest!, sharedId),
        subjectId: REGISTRY[0].id,
      })
    ).resolves.toMatchObject({ ok: true });
    await expect(
      store.recordFounderDecision({
        assuranceProfile: assuranceProfile(REGISTRY[0]),
        decidedAt: '2026-09-04T20:03:03.000Z',
        decision: decision(
          first.admission.decisionEvidenceDigest!,
          'decision-2'
        ),
        subjectId: REGISTRY[0].id,
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: 'duplicate_founder_decision',
    });
    await expect(
      store.recordFounderDecision({
        assuranceProfile: assuranceProfile(REGISTRY[1]),
        decidedAt: '2026-09-04T20:03:03.000Z',
        decision: decision(second.admission.decisionEvidenceDigest!, sharedId),
        subjectId: REGISTRY[1].id,
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: 'duplicate_founder_decision',
    });
  });

  it('retries decisions against concurrent packets without stale taste locks', async () => {
    const records = new Map<string, unknown>();
    const writable = memoryBackend(records);
    const baseStore = new MarketingCertificationStore(writable, REGISTRY);
    const basePacket = packet(REGISTRY[0]);
    const initial = await baseStore.ingestPacket(
      basePacket,
      '2026-09-04T20:04:00.000Z'
    );
    let race = true;
    const racing: CertificationRecordBackend = {
      ...writable,
      async compareAndSet(key, expected, next, ttl) {
        if (race) {
          race = false;
          const concurrentPacket = packet(REGISTRY[0]);
          await baseStore.ingestPacket(
            {
              ...concurrentPacket,
              visualProof: [
                ...concurrentPacket.visualProof,
                proof('visual_proof', 'new-taste'),
              ],
            },
            '2026-09-04T20:04:01.000Z'
          );
          return false;
        }
        return writable.compareAndSet(key, expected, next, ttl);
      },
    };

    const result = await new MarketingCertificationStore(
      racing,
      REGISTRY
    ).recordFounderDecision({
      assuranceProfile: assuranceProfile(REGISTRY[0]),
      decidedAt: '2026-09-04T20:04:02.000Z',
      decision: decision(initial.admission.decisionEvidenceDigest!),
      subjectId: REGISTRY[0].id,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'decision_digest_mismatch',
    });
  });

  it('rejects stale packet CAS retries and keeps newer failed evidence', async () => {
    const records = new Map<string, unknown>();
    const writable = memoryBackend(records);
    const store = new MarketingCertificationStore(writable, REGISTRY);
    const current = packet(REGISTRY[0]);
    await store.ingestPacket(current, '2026-09-04T20:05:00.000Z');
    let race = true;
    const racing: CertificationRecordBackend = {
      ...writable,
      async compareAndSet(key, expected, next, ttl) {
        if (race) {
          race = false;
          await store.ingestPacket(
            packet(REGISTRY[0], {
              testsCoverage: [
                proof('tests_coverage', 'newer-failure', 'failed'),
              ],
            }),
            '2026-09-04T20:05:02.000Z'
          );
          return false;
        }
        return writable.compareAndSet(key, expected, next, ttl);
      },
    };

    await expect(
      new MarketingCertificationStore(racing, REGISTRY).ingestPacket(
        current,
        '2026-09-04T20:05:01.000Z'
      )
    ).rejects.toThrow('is not newer than the persisted packet');
    const persisted = (await store.projectLedger()).rows[0];
    expect(persisted.packet.testsCoverage[0].status).toBe('failed');
    expect(persisted.admission.state).toBe('working');
  });

  it('compares packet timestamps numerically and validates mutation input', async () => {
    const store = new MarketingCertificationStore(memoryBackend(), REGISTRY);
    const valid = packet(REGISTRY[0]);
    const row = await store.ingestPacket(valid, '2026-09-04T20:06:00.000Z');
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
      } as unknown as CertificationReviewPacket)
    ).rejects.toThrow('invalid runtime shape');
    await expect(
      store.recordFounderDecision({
        assuranceProfile: assuranceProfile(REGISTRY[0]),
        decidedAt: 'invalid',
        decision: decision(row.admission.decisionEvidenceDigest!),
        subjectId: REGISTRY[0].id,
      })
    ).rejects.toThrow('valid timestamp');
    await expect(
      store.recordFounderDecision({
        assuranceProfile: assuranceProfile(REGISTRY[0]),
        decidedAt: '2026-09-04T20:05:59.000Z',
        decision: decision(row.admission.decisionEvidenceDigest!, ''),
        subjectId: REGISTRY[0].id,
      })
    ).rejects.toThrow(/invalid|predates/);
  });

  it('rejects source, identity, unknown, and unresolved input drift', async () => {
    const store = new MarketingCertificationStore(memoryBackend(), REGISTRY);
    await expect(
      store.ingestPacket(
        packet(REGISTRY[0], {
          source: { ...packet(REGISTRY[0]).source!, paths: ['wrong.tsx'] },
        })
      )
    ).rejects.toThrow('does not bind canonical source');
    await expect(
      store.ingestPacket(
        packet(REGISTRY[0], {
          subject: { ...packet(REGISTRY[0]).subject, title: 'Spoofed' },
        })
      )
    ).rejects.toThrow('does not match its canonical registry identity');
    await expect(
      store.ingestPacket(
        packet(REGISTRY[0], {
          subject: { ...packet(REGISTRY[0]).subject, id: 'unknown' },
        })
      )
    ).rejects.toThrow('Unknown marketing certification identity');

    const unresolved = MARKETING_COMPONENT_REGISTRY.find(
      entry => !entry.sourceBacked
    )!;
    const unresolvedStore = new MarketingCertificationStore(memoryBackend(), [
      unresolved,
    ]);
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

  it.each([
    42,
    '{',
    '{}',
  ] as const)('fails closed for corrupt ledger %j', async raw => {
    const backend = memoryBackend(
      new Map([[MARKETING_CERTIFICATION_STORE_KEY, raw]])
    );
    await expect(
      new MarketingCertificationStore(backend, REGISTRY).projectLedger()
    ).rejects.toBeInstanceOf(MarketingCertificationPersistenceError);
  });

  it('rejects persisted packet, decision, audit, and replay corruption', async () => {
    for (const corruption of [
      'packet',
      'decision',
      'audit',
      'replay',
    ] as const) {
      const records = new Map<string, unknown>();
      const store = new MarketingCertificationStore(
        memoryBackend(records),
        REGISTRY
      );
      const admitted = await store.ingestPacket(
        packet(REGISTRY[0]),
        '2026-09-04T20:07:00.000Z'
      );
      await store.recordFounderDecision({
        assuranceProfile: assuranceProfile(REGISTRY[0]),
        decidedAt: '2026-09-04T20:07:01.000Z',
        decision: decision(admitted.admission.decisionEvidenceDigest!),
        subjectId: REGISTRY[0].id,
      });
      const ledger = JSON.parse(
        records.get(MARKETING_CERTIFICATION_STORE_KEY) as string
      );
      if (corruption === 'packet')
        ledger.records[REGISTRY[0].id].packet.subject.id = REGISTRY[1].id;
      if (corruption === 'decision')
        ledger.records[REGISTRY[0].id].decisions[0].subjectId = REGISTRY[1].id;
      if (corruption === 'audit')
        ledger.records[REGISTRY[0].id].auditHistory[0].subjectId =
          REGISTRY[1].id;
      if (corruption === 'replay')
        ledger.records[REGISTRY[1].id].decisions = [
          {
            ...ledger.records[REGISTRY[0].id].decisions[0],
            subjectId: REGISTRY[1].id,
          },
        ];
      records.set(MARKETING_CERTIFICATION_STORE_KEY, JSON.stringify(ledger));
      await expect(store.projectLedger()).rejects.toBeInstanceOf(
        MarketingCertificationPersistenceError
      );
    }
  });

  it('preserves a taste lock while operational evidence advances', async () => {
    const store = new MarketingCertificationStore(memoryBackend(), REGISTRY);
    const base = packet(REGISTRY[0]);
    const admitted = await store.ingestPacket(base, '2026-09-04T20:08:00.000Z');
    await store.recordFounderDecision({
      assuranceProfile: assuranceProfile(REGISTRY[0]),
      decidedAt: '2026-09-04T20:08:01.000Z',
      decision: decision(admitted.admission.decisionEvidenceDigest!),
      subjectId: REGISTRY[0].id,
    });
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
      '2026-09-04T20:08:02.000Z'
    );
    expect(operational.admission.state).toBe('monitored');
    expect(operational.admission.currentDecision?.id).toBe('decision-1');
  });

  it('bounds initialization and update contention', async () => {
    const neverInitializes: CertificationRecordBackend = {
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
      new MarketingCertificationStore(
        neverInitializes,
        REGISTRY
      ).projectLedger()
    ).rejects.toThrow('initialization lost compare-and-set repeatedly');

    const records = new Map<string, unknown>();
    const seed = new MarketingCertificationStore(
      memoryBackend(records),
      REGISTRY
    );
    await seed.projectLedger('2026-09-04T20:09:00.000Z');
    const neverUpdates: CertificationRecordBackend = {
      async compareAndSet() {
        return false;
      },
      async get(key) {
        return records.get(key);
      },
      async setIfAbsent() {
        return false;
      },
    };
    await expect(
      new MarketingCertificationStore(neverUpdates, REGISTRY).ingestPacket(
        packet(REGISTRY[0]),
        '2026-09-04T20:09:01.000Z'
      )
    ).rejects.toThrow('update lost compare-and-set repeatedly');
  });
});
