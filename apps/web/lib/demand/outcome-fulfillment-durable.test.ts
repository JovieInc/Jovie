import { describe, expect, it } from 'vitest';
import { DEMAND_ALLOCATION_KEY } from './allocation-governor';
import { capabilityGapId, supplierDigest } from './outcome-compiler';
import {
  BEFORE,
  certification,
  command,
  fact,
  fulfilled,
  harness,
  metrics,
  outcome,
  primitive,
  scope,
  supplier,
} from './outcome-fulfillment.fixtures';

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
        id: string = primitive.id
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
