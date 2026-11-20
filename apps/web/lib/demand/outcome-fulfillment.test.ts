import { describe, expect, it } from 'vitest';
import { compilePresenceOutcome, supplierDigest } from './outcome-compiler';
import {
  AFTER,
  BEFORE,
  bio,
  certification,
  command,
  fact,
  fulfilled,
  metrics,
  NOW,
  otherScope,
  outcome,
  primitive,
  scope,
  supplier,
} from './outcome-fulfillment.fixtures';

describe('source-owner certification and completed customer jobs', () => {
  it('ranks completed-job economics before rejecting a single costly successful job', () => {
    const sources = ['a', 'b'].map(id => supplier({ id: `fixture:${id}` }));
    const receipts = Array.from({ length: 10 }, (_, index) =>
      outcome(sources[0], {
        id: `job-a:${index}`,
        jobId: `job-a:${index}`,
        certificationId: 'cert:a',
        completedAt: `2026-11-16T10:06:0${index}.000Z`,
        realized: { ...metrics, fullyLoadedCostCents: index === 9 ? 101 : 1 },
      })
    );
    receipts.push(
      outcome(sources[1], {
        id: 'job-b',
        jobId: 'job-b',
        certificationId: 'cert:b',
        realized: { ...metrics, fullyLoadedCostCents: 20 },
      })
    );
    expect(
      bio(
        command({
          suppliers: sources,
          certifications: sources.map((source, index) =>
            certification(source, {
              id: index ? 'cert:b' : 'cert:a',
            })
          ),
          outcomes: receipts,
        })
      ).decision
    ).toMatchObject({
      kind: 'promote',
      supplierDigest: supplierDigest(sources[0]),
    });
  });

  it('selects the supplier with better completed-job economics over its cheaper trial competitor', () => {
    const sources = ['a', 'b'].map(id => supplier({ id: `fixture:${id}` }));
    const input = command({
      suppliers: sources,
      certifications: sources.map((source, index) =>
        certification(source, { id: `cert:${index}` })
      ),
      outcomes: sources.map((source, index) =>
        outcome(source, {
          id: `outcome:economics:${index}`,
          jobId: `fixture:economics:${index}`,
          certificationId: `cert:${index}`,
          realized: { ...metrics, fullyLoadedCostCents: index ? 4 : 80 },
        })
      ),
      trials: sources.map((source, index) => ({
        id: `trial:economics:${index}`,
        supplierDigest: supplierDigest(source),
        startedAt: BEFORE,
        completedAt: BEFORE,
        evidenceRefs: ['fixture:bounded-economic-trial'],
        realized: { ...metrics, fullyLoadedCostCents: index + 2 },
      })),
    });
    expect(bio(input).decision).toMatchObject({
      kind: 'promote',
      supplierDigest: supplierDigest(sources[1]),
    });
  });

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
    expect(bio(fulfilled({ facts: [] })).decision.kind).toBe('promote');
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

  it('coalesces identical same-job outcomes with distinct delivery receipt ids', () => {
    const receipt = outcome();
    const copy = { ...receipt, id: 'outcome:backfill-copy' };
    const expected = bio(fulfilled({ outcomes: [receipt] }));
    for (const outcomes of [
      [receipt, copy],
      [copy, receipt],
    ]) {
      const current = bio(fulfilled({ outcomes }));
      expect(current.state).toBe('known');
      expect(current.decision.kind).toBe(expected.decision.kind);
      expect(current.fulfillment).toEqual(expected.fulfillment);
    }
    const conflicting = {
      ...copy,
      realized: { ...copy.realized, fullyLoadedCostCents: 8 },
    };
    expect(bio(fulfilled({ outcomes: [receipt, conflicting] }))).toMatchObject({
      state: 'unknown',
      fulfillment: {
        attemptedJobs: 1,
        correctCompletedJobs: 0,
        fullyLoadedCostCents: 8,
      },
    });
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
    const certifications = [
      certification(),
      certification(supplier(), { id: 'certification:ambiguous-peer' }),
    ];
    expect(bio(fulfilled({ certifications }))).toMatchObject({
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
