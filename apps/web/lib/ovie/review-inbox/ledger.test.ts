import { describe, expect, it } from 'vitest';
import type { ReviewInboxDecisionBody } from './contract';
import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_PILOT_TENANT,
} from './contract';
import {
  createReviewInboxLedger,
  pilotReviewInboxScope,
  type ReviewInboxLedgerRecord,
  type ReviewInboxRepository,
  reviewInboxScopeKey,
} from './ledger';
import { isMarkStale, marksForAsset } from './marks';
import {
  createPilotReviewCase,
  PILOT_V1_DIGEST,
  PILOT_V2_DIGEST,
} from './pilot-fixture';

/** In-process repository with the same CAS semantics as the KV store. */
function createMemoryReviewInboxRepository(): ReviewInboxRepository & {
  readonly rows: Map<string, ReviewInboxLedgerRecord>;
} {
  const rows = new Map<string, ReviewInboxLedgerRecord>();
  return {
    rows,
    async read(key) {
      const row = rows.get(key);
      return row ? structuredClone(row) : null;
    },
    async compareAndSet(key, expectedRevision, value) {
      const row = rows.get(key);
      if (expectedRevision === null ? row : row?.revision !== expectedRevision)
        return false;
      rows.set(key, structuredClone(value));
      return true;
    },
  };
}

const founder = pilotReviewInboxScope('user_founder');

function body(
  partial: Partial<ReviewInboxDecisionBody> = {}
): ReviewInboxDecisionBody {
  return {
    contract: REVIEW_INBOX_DECISION_CONTRACT,
    tenant: REVIEW_INBOX_PILOT_TENANT,
    caseId: REVIEW_INBOX_PILOT_TENANT,
    revision: 'v1',
    command: 'favorite',
    actionId: crypto.randomUUID(),
    ...partial,
  };
}

const v1Pin = {
  id: 'pin-1',
  assetDigest: PILOT_V1_DIGEST,
  revision: 'v1',
  x: 0.42,
  y: 0.18,
  note: 'Tighten crop on the hero',
};
const v1Stroke = {
  id: 'stroke-1',
  assetDigest: PILOT_V1_DIGEST,
  revision: 'v1',
  points: [
    [0.1, 0.1],
    [0.2, 0.25],
    [0.3, 0.2],
  ] as const,
};

function requestChanges() {
  return body({
    command: 'request_changes',
    pins: [v1Pin],
    strokes: [v1Stroke],
    notes: 'Warmer light overall',
  });
}

describe('durable review inbox ledger', () => {
  it('keeps requested-change marks across a fresh ledger instance', async () => {
    const repository = createMemoryReviewInboxRepository();
    const first = createReviewInboxLedger(repository);
    expect((await first.apply(founder, requestChanges())).ok).toBe(true);

    // A restart or a second serverless instance shares only the store.
    const reopened =
      await createReviewInboxLedger(repository).readCase(founder);
    expect(reopened.lifecycle).toBe('changes_requested');
    expect(reopened.pins.map(pin => pin.id)).toContain('pin-1');
    expect(reopened.strokes).toEqual([{ ...v1Stroke, author: 'founder' }]);
    expect(reopened.comments[0]).toMatchObject({
      revision: 'v1',
      body: 'Warmer light overall',
      author: 'founder',
    });
  });

  it('round-trips v1 → request changes → v2 → accept → reopen', async () => {
    const repository = createMemoryReviewInboxRepository();
    const ledger = createReviewInboxLedger(repository);
    await ledger.apply(founder, requestChanges());
    const accept = await ledger.apply(
      founder,
      body({
        revision: 'v2',
        command: 'accept_version',
        acceptRevision: 'v2',
      })
    );
    expect(accept.ok).toBe(true);
    const done = await createReviewInboxLedger(repository).readCase(founder);
    expect(done.acceptedRevision).toBe('v2');
    expect(done.privateLibraryReceipt).toMatch(/^synthetic-test-library:v2:/);
    // Reopening keeps the v1 feedback the decision was made on.
    expect(done.strokes).toHaveLength(1);
    expect(done.pins.some(pin => pin.author === 'agent')).toBe(true);
  });

  it('isolates marks per asset revision and flags older ones stale', async () => {
    const ledger = createReviewInboxLedger(createMemoryReviewInboxRepository());
    await ledger.apply(founder, requestChanges());
    const reviewCase = await ledger.readCase(founder);
    const [v1, v2] = reviewCase.candidates;
    if (!v1 || !v2) throw new Error('fixture needs two candidates');

    const onV1 = marksForAsset(reviewCase, v1);
    const onV2 = marksForAsset(reviewCase, v2);
    expect(onV1.strokes.map(s => s.id)).toEqual(['stroke-1']);
    expect(onV1.pins.map(p => p.id)).toEqual(['pin-1']);
    expect(onV2.strokes).toEqual([]);
    expect(onV2.pins.every(p => p.assetDigest === PILOT_V2_DIGEST)).toBe(true);

    expect(isMarkStale(onV1.strokes[0]!, reviewCase)).toBe(true);
    expect(isMarkStale(onV2.pins[0]!, reviewCase)).toBe(false);
    expect(isMarkStale({ revision: 'v1' }, createPilotReviewCase())).toBe(
      false
    );
  });

  it('rejects marks on a revision that is no longer active', async () => {
    const ledger = createReviewInboxLedger(createMemoryReviewInboxRepository());
    await ledger.apply(founder, requestChanges());
    const late = await ledger.apply(
      founder,
      body({
        revision: 'v2',
        command: 'request_changes',
        strokes: [v1Stroke],
      })
    );
    expect(late.ok).toBe(false);
  });

  it('requires at least one pin or stroke to request changes', async () => {
    const ledger = createReviewInboxLedger(createMemoryReviewInboxRepository());
    const strokeOnly = await ledger.apply(
      founder,
      body({ command: 'request_changes', strokes: [v1Stroke] })
    );
    expect(strokeOnly.ok).toBe(true);
    const empty = await createReviewInboxLedger(
      createMemoryReviewInboxRepository()
    ).apply(founder, body({ command: 'request_changes' }));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toBe('invalid_pin');
  });

  it('keeps each principal in its own record', async () => {
    const repository = createMemoryReviewInboxRepository();
    const ledger = createReviewInboxLedger(repository);
    await ledger.apply(founder, requestChanges());
    const other = pilotReviewInboxScope('user_other');
    expect((await ledger.readCase(other)).lifecycle).toBe('awaiting_review');
    expect(reviewInboxScopeKey(other)).not.toBe(reviewInboxScopeKey(founder));

    // A record copied under another key fails closed instead of leaking.
    repository.rows.set(
      reviewInboxScopeKey(other),
      repository.rows.get(reviewInboxScopeKey(founder))!
    );
    await expect(ledger.readCase(other)).rejects.toThrow('another scope');
  });

  it('dedupes action ids durably and returns the prior receipt', async () => {
    const repository = createMemoryReviewInboxRepository();
    const actionId = 'fixed-action-id';
    expect(
      (
        await createReviewInboxLedger(repository).apply(
          founder,
          body({ actionId })
        )
      ).ok
    ).toBe(true);
    const fresh = createReviewInboxLedger(repository);
    const dupe = await fresh.apply(founder, body({ actionId }));
    expect(dupe.ok).toBe(false);
    if (!dupe.ok) expect(dupe.error).toBe('duplicate_action');
    expect((await fresh.receiptFor(founder, actionId))?.ack).toBe(true);
    expect(await fresh.receiptFor(founder, 'never-seen')).toBeNull();
  });

  it('re-gates against the latest record when a concurrent write wins', async () => {
    const inner = createMemoryReviewInboxRepository();
    let raced = false;
    const racing: ReviewInboxRepository = {
      read: key => inner.read(key),
      async compareAndSet(key, expected, value) {
        if (!raced) {
          raced = true;
          // Another tab requests changes first.
          await createReviewInboxLedger(inner).apply(founder, requestChanges());
        }
        return inner.compareAndSet(key, expected, value);
      },
    };
    const outcome = await createReviewInboxLedger(racing).apply(
      founder,
      requestChanges()
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBe('stale_revision');
    expect(
      (await createReviewInboxLedger(inner).readCase(founder)).strokes
    ).toHaveLength(1);
  });
});
