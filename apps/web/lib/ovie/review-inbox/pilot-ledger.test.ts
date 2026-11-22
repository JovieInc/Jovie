import { beforeEach, describe, expect, it } from 'vitest';
import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_PILOT_TENANT,
} from './contract';
import { gateReviewDecision } from './gates';
import { createPilotReviewCase, PILOT_V1_DIGEST } from './pilot-fixture';
import {
  applyReviewInboxDecision,
  readReviewInboxPilotCase,
  resetReviewInboxPilotLedger,
  reviewInboxPilotReceiptForAction,
} from './pilot-ledger';

function body(
  partial: Partial<Parameters<typeof applyReviewInboxDecision>[0]> = {}
) {
  return {
    contract: REVIEW_INBOX_DECISION_CONTRACT,
    tenant: REVIEW_INBOX_PILOT_TENANT,
    caseId: REVIEW_INBOX_PILOT_TENANT,
    revision: 'v1',
    command: 'favorite' as const,
    actionId: crypto.randomUUID(),
    ...partial,
  };
}

describe('review inbox pilot ledger', () => {
  beforeEach(() => {
    resetReviewInboxPilotLedger();
  });

  it('runs pin → request changes → v2 responses → accept v2', () => {
    const pin = {
      id: 'pin-1',
      assetDigest: PILOT_V1_DIGEST,
      revision: 'v1',
      x: 0.42,
      y: 0.18,
      note: 'Tighten crop on the hero',
    };
    const change = applyReviewInboxDecision(
      body({
        command: 'request_changes',
        pins: [pin],
      })
    );
    expect(change.ok).toBe(true);
    const mid = readReviewInboxPilotCase();
    expect(mid.lifecycle).toBe('changes_requested');
    expect(mid.activeRevision).toBe('v2');
    expect(mid.pins.some(p => p.author === 'agent')).toBe(true);

    const accept = applyReviewInboxDecision(
      body({
        revision: 'v2',
        command: 'accept_version',
        acceptRevision: 'v2',
      })
    );
    expect(accept.ok).toBe(true);
    const done = readReviewInboxPilotCase();
    expect(done.acceptedRevision).toBe('v2');
    expect(done.privateLibraryReceipt).toMatch(/^synthetic-test-library:v2:/);
    expect(done.state).toBe('disposed');
  });

  it('rejects stale revision (revision vs acceptance race)', () => {
    applyReviewInboxDecision(
      body({
        command: 'request_changes',
        pins: [
          {
            id: 'p1',
            assetDigest: PILOT_V1_DIGEST,
            revision: 'v1',
            x: 0.5,
            y: 0.5,
            note: 'Fix lighting',
          },
        ],
      })
    );
    const race = applyReviewInboxDecision(
      body({
        revision: 'v1',
        command: 'accept_version',
        acceptRevision: 'v2',
      })
    );
    expect(race.ok).toBe(false);
    if (!race.ok) {
      expect(race.error).toBe('stale_revision');
      expect(race.status).toBe(409);
    }
  });

  it('dedupes duplicate action ids without blind external retry', () => {
    const actionId = 'fixed-action-id';
    const first = applyReviewInboxDecision(body({ actionId }));
    expect(first.ok).toBe(true);
    const dupe = applyReviewInboxDecision(body({ actionId }));
    expect(dupe.ok).toBe(false);
    if (!dupe.ok) expect(dupe.error).toBe('duplicate_action');
    expect(reviewInboxPilotReceiptForAction(actionId)?.ack).toBe(true);
  });

  it('returns missing ack when action id unknown', () => {
    expect(reviewInboxPilotReceiptForAction('never-seen')).toBeNull();
  });

  it('blocks accept v1 and publish/spend in pilot', () => {
    const wrongAccept = gateReviewDecision(
      createPilotReviewCase(),
      body({ command: 'accept_version', acceptRevision: 'v1' }),
      new Set()
    );
    expect(wrongAccept.ok).toBe(false);

    const spend = gateReviewDecision(
      createPilotReviewCase(),
      body({ command: 'spend' }),
      new Set()
    );
    expect(spend.ok).toBe(false);
  });
});
