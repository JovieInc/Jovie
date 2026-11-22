import 'server-only';

import type {
  ReviewInboxDecisionBody,
  ReviewInboxDecisionReceipt,
  ReviewInboxPilotCase,
  ReviewInboxPin,
} from './contract';
import { REVIEW_INBOX_DECISION_CONTRACT } from './contract';
import { gateReviewDecision } from './gates';
import { createPilotReviewCase } from './pilot-fixture';

interface PilotLedgerState {
  case: ReviewInboxPilotCase;
  readonly actionIds: Set<string>;
  readonly receipts: ReviewInboxDecisionReceipt[];
}

const globalStore = globalThis as typeof globalThis & {
  __jovieReviewInboxPilot?: PilotLedgerState;
};

function ledger(): PilotLedgerState {
  if (!globalStore.__jovieReviewInboxPilot) {
    globalStore.__jovieReviewInboxPilot = {
      case: createPilotReviewCase(),
      actionIds: new Set(),
      receipts: [],
    };
  }
  return globalStore.__jovieReviewInboxPilot;
}

/** Test-only reset. */
export function resetReviewInboxPilotLedger(): void {
  globalStore.__jovieReviewInboxPilot = undefined;
}

export function readReviewInboxPilotCase(): ReviewInboxPilotCase {
  return structuredClone(ledger().case);
}

export function applyReviewInboxDecision(body: ReviewInboxDecisionBody):
  | { readonly ok: true; readonly receipt: ReviewInboxDecisionReceipt }
  | {
      readonly ok: false;
      readonly status: 409 | 400 | 422;
      readonly error: string;
      readonly message: string;
    } {
  const store = ledger();
  const gate = gateReviewDecision(store.case, body, store.actionIds);
  if (!gate.ok) {
    const status =
      gate.error === 'stale_revision' || gate.error === 'duplicate_action'
        ? 409
        : gate.error === 'invalid_contract' || gate.error === 'forbidden_tenant'
          ? 400
          : 422;
    return { ok: false, status, error: gate.error, message: gate.message };
  }

  let next = structuredClone(store.case);

  switch (body.command) {
    case 'favorite':
      break;
    case 'request_changes': {
      const pins: ReviewInboxPin[] = (body.pins ?? []).map(pin => ({
        ...pin,
        author: 'founder',
      }));
      const agentResponses: ReviewInboxPin[] = pins.map(pin => ({
        ...pin,
        id: `${pin.id}-response`,
        revision: 'v2',
        note: `Addressed: ${pin.note}`,
        author: 'agent',
      }));
      next = {
        ...next,
        lifecycle: 'changes_requested',
        activeRevision: 'v2',
        pins: [...pins, ...agentResponses],
        recommendation:
          'v2 includes responses to your v1 pins. Accept v2 to store in the private test library.',
      };
      break;
    }
    case 'accept_version':
      next = {
        ...next,
        lifecycle: 'accepted',
        activeRevision: 'v2',
        acceptedRevision: 'v2',
        state: 'disposed',
        privateLibraryReceipt: `synthetic-test-library:v2:${body.actionId}`,
      };
      break;
    default:
      return {
        ok: false,
        status: 422,
        error: 'invalid_scope',
        message: 'Command blocked in pilot.',
      };
  }

  store.case = next;
  store.actionIds.add(body.actionId);
  const receipt: ReviewInboxDecisionReceipt = {
    contract: REVIEW_INBOX_DECISION_CONTRACT,
    actionId: body.actionId,
    command: body.command,
    revision: body.revision,
    ack: true,
    case: structuredClone(next),
  };
  store.receipts.push(receipt);
  return { ok: true, receipt };
}

/** Missing ack: external callers must not retry blindly without reading receipts. */
export function reviewInboxPilotReceiptForAction(
  actionId: string
): ReviewInboxDecisionReceipt | null {
  return (
    ledger().receipts.find(receipt => receipt.actionId === actionId) ?? null
  );
}
