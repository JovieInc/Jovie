import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { insert, select } = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { insert, select },
}));

import {
  addInvestorUpdateCandidate,
  approveInvestorUpdateSnapshot,
  loadInvestorUpdateReviewState,
  recordInvestorUpdateDeliveryEvent,
  upsertInvestorUpdateDraft,
} from './update-store';

function queryResult<T>(result: T) {
  const builder: Record<string, unknown> = {};
  for (const method of ['from', 'innerJoin', 'where', 'orderBy']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.limit = vi.fn(() => Promise.resolve(result));
  builder.then = (
    resolve: (value: T) => unknown,
    reject: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function insertResult<T>(result: T, error?: Error) {
  const builder: Record<string, unknown> = {};
  builder.values = vi.fn(() => builder);
  builder.onConflictDoUpdate = vi.fn(() => builder);
  builder.returning = vi.fn(() =>
    error ? Promise.reject(error) : Promise.resolve(result)
  );
  return builder;
}

const draft = {
  id: '11111111-1111-4111-8111-111111111111',
  periodStart: '2026-08-01',
  subject: 'Jovie investor update, August 2026',
  revision: 4,
  createdByUserId: 'user_1',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-29T17:00:00.000Z'),
};

const candidate = {
  id: '22222222-2222-4222-8222-222222222222',
  draftId: draft.id,
  kind: 'win' as const,
  category: 'shipping',
  metricLabel: 'Merged product improvements',
  metricValue: '12',
  metricUnit: 'pull requests',
  windowStart: new Date('2026-08-01T00:00:00.000Z'),
  windowEnd: new Date('2026-08-29T00:00:00.000Z'),
  sourceRecordId: '33333333-3333-4333-8333-333333333333',
  sourceLabel: 'GitHub merged pull requests',
  sourceUrl: 'https://github.com/JovieInc/Jovie/pulls?q=is%3Apr+is%3Amerged',
  sourceObservedAt: new Date('2026-08-29T16:00:00.000Z'),
  confidence: 0.95,
  caveats: ['Counts merged changes, not production deployments.'],
  proposedClaim: 'We merged 12 product improvements this month.',
  relevanceScore: 0.9,
  createdAt: new Date('2026-08-29T16:05:00.000Z'),
};

const decision = {
  id: '44444444-4444-4444-8444-444444444444',
  candidateId: candidate.id,
  decision: 'share' as const,
  editedClaim: null,
  decidedByUserId: 'user_1',
  decidedAt: new Date('2026-08-29T16:10:00.000Z'),
};

const segments = [
  { role: 'investor' as const, included: true, recipientCount: 7 },
  { role: 'advisor' as const, included: false, recipientCount: 0 },
  { role: 'founder_self' as const, included: true, recipientCount: 1 },
  { role: 'other_explicit' as const, included: false, recipientCount: 0 },
];

const renderedCopy = `${draft.subject}\n\nWins\n- ${candidate.proposedClaim}`;

describe('investor update persistence boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists approval against the exact draft revision and decision ids', async () => {
    select
      .mockReturnValueOnce(queryResult([draft]))
      .mockReturnValueOnce(queryResult([candidate]))
      .mockReturnValueOnce(queryResult([decision]));
    const approvalInsert = insertResult([
      { id: '55555555-5555-4555-8555-555555555555' },
    ]);
    insert.mockReturnValueOnce(approvalInsert);

    await expect(
      approveInvestorUpdateSnapshot({
        draftId: draft.id,
        expectedRenderedCopy: renderedCopy,
        segments,
        recipientCount: 8,
        trackingSettings: {
          opens: false,
          clicks: false,
          privacyDisclosureVersion: null,
          consentBasis: null,
        },
        userId: 'user_1',
        now: new Date('2026-08-29T17:00:00.000Z'),
      })
    ).resolves.toBe('55555555-5555-4555-8555-555555555555');

    expect(approvalInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: draft.id,
        draftRevision: 4,
        decisionRecordIds: [decision.id],
        recipientSegments: segments,
        recipientCount: 8,
      })
    );
  });

  it('turns a database revision conflict into a founder-visible re-review', async () => {
    select
      .mockReturnValueOnce(queryResult([draft]))
      .mockReturnValueOnce(queryResult([candidate]))
      .mockReturnValueOnce(queryResult([decision]));
    const conflict = new Error('Failed query', {
      cause: new Error('investor_update_revision_conflict'),
    });
    insert.mockReturnValueOnce(insertResult([], conflict));

    await expect(
      approveInvestorUpdateSnapshot({
        draftId: draft.id,
        expectedRenderedCopy: renderedCopy,
        segments,
        recipientCount: 8,
        trackingSettings: {
          opens: false,
          clicks: false,
          privacyDisclosureVersion: null,
          consentBasis: null,
        },
        userId: 'user_1',
      })
    ).rejects.toThrow('draft changed during approval');
  });

  it('does not present an approval as current when the final revision read moved', async () => {
    select
      .mockReturnValueOnce(queryResult([draft]))
      .mockReturnValueOnce(queryResult([candidate]))
      .mockReturnValueOnce(queryResult([decision]))
      .mockReturnValueOnce(
        queryResult([
          {
            id: '55555555-5555-4555-8555-555555555555',
            draftId: draft.id,
            renderedCopy: 'stale',
            copyHash: 'stale',
            snapshotFingerprint: 'stale',
            draftRevision: 4,
            decisionRecordIds: [decision.id],
            recipientSegments: segments,
            recipientCount: 8,
            trackingSettings: {
              opens: false,
              clicks: false,
              privacyDisclosureVersion: null,
              consentBasis: null,
            },
            approvedByUserId: 'user_1',
            approvedAt: new Date('2026-08-29T16:20:00.000Z'),
            expiresAt: new Date('2026-08-29T16:35:00.000Z'),
          },
        ])
      )
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(queryResult([{ revision: 5 }]));

    const state = await loadInvestorUpdateReviewState();
    expect(state.latestApproval?.matchesCurrentDraft).toBe(false);
  });

  it('rejects candidate ingestion when the source is not owned by the submitter', async () => {
    select
      .mockReturnValueOnce(queryResult([{ id: draft.id }]))
      .mockReturnValueOnce(queryResult([]));

    await expect(
      addInvestorUpdateCandidate({
        draftId: draft.id,
        sourceOwnerUserId: 'user_1',
        candidate: {
          kind: 'win',
          category: candidate.category,
          metricLabel: candidate.metricLabel,
          metricValue: candidate.metricValue,
          metricUnit: candidate.metricUnit,
          windowStart: candidate.windowStart.toISOString(),
          windowEnd: candidate.windowEnd.toISOString(),
          sourceRecordId: candidate.sourceRecordId,
          sourceLabel: candidate.sourceLabel,
          sourceUrl: candidate.sourceUrl,
          sourceObservedAt: candidate.sourceObservedAt.toISOString(),
          confidence: candidate.confidence,
          caveats: candidate.caveats,
          proposedClaim: candidate.proposedClaim,
          relevanceScore: candidate.relevanceScore,
        },
      })
    ).rejects.toThrow('source owned by the submitting user');
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects malformed monthly periods before touching persistence', async () => {
    await expect(
      upsertInvestorUpdateDraft({
        periodStart: '2026-08-29',
        subject: 'Not a monthly boundary',
        userId: 'user_1',
      })
    ).rejects.toThrow('first-of-month');
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects receipt counts above the approved exact audience', async () => {
    const now = new Date();
    select.mockReturnValueOnce(
      queryResult([
        {
          id: '55555555-5555-4555-8555-555555555555',
          recipientCount: 7,
          approvedAt: new Date(now.getTime() - 60_000),
          expiresAt: new Date(now.getTime() + 60_000),
        },
      ])
    );

    await expect(
      recordInvestorUpdateDeliveryEvent({
        approvalId: '55555555-5555-4555-8555-555555555555',
        eventType: 'provider_accepted',
        recipientCount: 8,
        externalReference: 'provider:event:opaque-123',
        occurredAt: now.toISOString(),
        userId: 'trusted_adapter',
      })
    ).rejects.toThrow('cannot exceed the approved recipient count');
    expect(insert).not.toHaveBeenCalled();
  });

  it('locks approval snapshots and makes the evidence ledger append-only in SQL', async () => {
    const migration = await readFile(
      join(process.cwd(), 'drizzle/migrations/0098_hesitant_demogoblin.sql'),
      'utf8'
    );

    expect(migration).toContain('FOR SHARE');
    expect(migration).toContain('investor_update_revision_conflict');
    expect(migration).toContain('investor_update_decision_snapshot_stale');
    expect(migration).toContain('candidate_count <> latest_count');
    expect(migration).toContain('investor_update_candidates_immutable');
    expect(migration).toContain('investor_update_decisions_immutable');
    expect(migration).toContain('investor_update_approvals_immutable');
    expect(migration).toContain('investor_update_delivery_events_immutable');
  });
});
