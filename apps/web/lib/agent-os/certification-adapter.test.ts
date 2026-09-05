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
  type CertificationRecordBackend,
  MARKETING_CERTIFICATION_STORE_KEY,
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

function packet(
  entry: MarketingRegistryEntry,
  overrides: Partial<CertificationReviewPacket> = {}
): CertificationReviewPacket {
  if (!entry.resolvedSource) throw new Error('source-backed fixture required');
  const mediaId = `${entry.id}-media`;
  const variantId = `${entry.id}-default`;
  return {
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
    testsCoverage: [proof('tests_coverage', `${entry.id}-coverage`)],
    visualProof: [proof('visual_proof', `${entry.id}-visual`)],
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
      store.projectReviewReady({ existingEntryId: null })
    ).resolves.toMatchObject({ eligibleSubjectIds: [], selected: null });
  });

  it('selects deterministically at most one and preserves occupied Badge', async () => {
    const store = new MarketingCertificationStore(memoryBackend(), REGISTRY);
    await store.ingestPacket(packet(REGISTRY[0]), '2026-09-04T20:02:00.000Z');
    await store.ingestPacket(packet(REGISTRY[1]), '2026-09-04T20:02:01.000Z');

    const open = await store.projectReviewReady({ existingEntryId: null });
    expect(open.selected?.subject.id).toBe(REGISTRY[0].id);
    expect(open.eligibleSubjectIds).toEqual(REGISTRY.map(entry => entry.id));
    expect(open.withheld).toEqual([
      { reason: 'max_one_arbitration', subjectId: REGISTRY[1].id },
    ]);

    const occupied = await store.projectReviewReady({
      existingEntryId: 'badge-semantic-tones',
    });
    expect(occupied.selected).toBeNull();
    expect(
      occupied.withheld.every(
        item => item.reason === 'existing_review_slot_occupied'
      )
    ).toBe(true);
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
        decidedAt: '2026-09-04T20:03:02.000Z',
        decision: decision(first.admission.decisionEvidenceDigest!, sharedId),
        subjectId: REGISTRY[0].id,
      })
    ).resolves.toMatchObject({ ok: true });
    await expect(
      store.recordFounderDecision({
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
          await baseStore.ingestPacket(
            packet(REGISTRY[0], {
              visualProof: [proof('visual_proof', 'new-taste')],
            }),
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
        decidedAt: 'invalid',
        decision: decision(row.admission.decisionEvidenceDigest!),
        subjectId: REGISTRY[0].id,
      })
    ).rejects.toThrow('valid timestamp');
    await expect(
      store.recordFounderDecision({
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
