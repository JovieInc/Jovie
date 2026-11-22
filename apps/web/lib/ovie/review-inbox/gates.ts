import type {
  ReviewInboxCommand,
  ReviewInboxDecisionBody,
  ReviewInboxPilotCase,
  ReviewInboxPin,
} from './contract';
import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_MARK_LIMITS,
  REVIEW_INBOX_PILOT_TENANT,
} from './contract';
import { isReviewInboxStrokeInput } from './marks';

export type ReviewInboxGateFailure =
  | 'invalid_contract'
  | 'forbidden_tenant'
  | 'stale_revision'
  | 'invalid_scope'
  | 'invalid_pin'
  | 'duplicate_action'
  | 'missing_ack'
  | 'accept_wrong_revision'
  | 'pilot_closed';

export type ReviewInboxGateResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly error: ReviewInboxGateFailure;
      readonly message: string;
    };

function isPin(value: unknown): value is Omit<ReviewInboxPin, 'author'> {
  if (!value || typeof value !== 'object') return false;
  const pin = value as Partial<ReviewInboxPin>;
  return (
    typeof pin.id === 'string' &&
    typeof pin.assetDigest === 'string' &&
    typeof pin.revision === 'string' &&
    typeof pin.note === 'string' &&
    pin.note.length <= REVIEW_INBOX_MARK_LIMITS.noteChars &&
    typeof pin.x === 'number' &&
    typeof pin.y === 'number' &&
    pin.x >= 0 &&
    pin.x <= 1 &&
    pin.y >= 0 &&
    pin.y <= 1
  );
}

export function validateReviewDecisionBody(
  body: unknown
): ReviewInboxDecisionBody | null {
  if (!body || typeof body !== 'object') return null;
  const candidate = body as Partial<ReviewInboxDecisionBody>;
  if (candidate.contract !== REVIEW_INBOX_DECISION_CONTRACT) return null;
  if (candidate.tenant !== REVIEW_INBOX_PILOT_TENANT) return null;
  if (candidate.caseId !== REVIEW_INBOX_PILOT_TENANT) return null;
  if (typeof candidate.revision !== 'string') return null;
  if (typeof candidate.actionId !== 'string' || !candidate.actionId)
    return null;
  const command = candidate.command;
  if (
    command !== 'favorite' &&
    command !== 'request_changes' &&
    command !== 'accept_version' &&
    command !== 'publish' &&
    command !== 'spend'
  ) {
    return null;
  }
  if (candidate.pins !== undefined) {
    if (
      !Array.isArray(candidate.pins) ||
      candidate.pins.length > REVIEW_INBOX_MARK_LIMITS.pins ||
      !candidate.pins.every(isPin)
    )
      return null;
  }
  if (candidate.strokes !== undefined) {
    if (
      !Array.isArray(candidate.strokes) ||
      candidate.strokes.length > REVIEW_INBOX_MARK_LIMITS.strokes ||
      !candidate.strokes.every(isReviewInboxStrokeInput)
    )
      return null;
  }
  if (
    candidate.notes !== undefined &&
    (typeof candidate.notes !== 'string' ||
      candidate.notes.length > REVIEW_INBOX_MARK_LIMITS.commentChars)
  )
    return null;
  return candidate as ReviewInboxDecisionBody;
}

type ReviewInboxLifecycle = ReviewInboxPilotCase['lifecycle'];

const PILOT_ALLOWED: Record<
  ReviewInboxLifecycle,
  readonly ReviewInboxCommand[]
> = {
  awaiting_review: ['favorite', 'request_changes', 'accept_version'],
  changes_requested: ['favorite', 'accept_version'],
  accepted: [],
};

export function gateReviewDecision(
  current: ReviewInboxPilotCase,
  body: ReviewInboxDecisionBody,
  seenActionIds: ReadonlySet<string>
): ReviewInboxGateResult {
  if (body.contract !== REVIEW_INBOX_DECISION_CONTRACT) {
    return {
      ok: false,
      error: 'invalid_contract',
      message: 'Unexpected decision contract.',
    };
  }
  if (body.tenant !== REVIEW_INBOX_PILOT_TENANT) {
    return {
      ok: false,
      error: 'forbidden_tenant',
      message: 'Pilot tenant only.',
    };
  }
  if (current.lifecycle === 'accepted') {
    return {
      ok: false,
      error: 'pilot_closed',
      message: 'This pilot case is already accepted.',
    };
  }
  if (body.revision !== current.activeRevision) {
    return {
      ok: false,
      error: 'stale_revision',
      message: 'Revision changed; reload before acting.',
    };
  }
  if (body.command === 'publish' || body.command === 'spend') {
    return {
      ok: false,
      error: 'invalid_scope',
      message: 'Publish and spend are disabled in the pilot.',
    };
  }
  const allowed = PILOT_ALLOWED[current.lifecycle];
  if (!allowed.includes(body.command)) {
    return {
      ok: false,
      error: 'invalid_scope',
      message: `Command "${body.command}" is not allowed in this state.`,
    };
  }
  if (body.command === 'accept_version') {
    if (body.acceptRevision !== 'v2') {
      return {
        ok: false,
        error: 'accept_wrong_revision',
        message: 'Pilot accepts exactly revision v2.',
      };
    }
    if (current.lifecycle !== 'changes_requested') {
      return {
        ok: false,
        error: 'invalid_scope',
        message: 'Accept v2 only after requesting changes on v1.',
      };
    }
  }
  if (body.command === 'request_changes') {
    if (!body.pins?.length && !body.strokes?.length) {
      return {
        ok: false,
        error: 'invalid_pin',
        message: 'Place a pin or draw on the image before requesting changes.',
      };
    }
    for (const mark of [...(body.pins ?? []), ...(body.strokes ?? [])]) {
      const asset = current.candidates.find(
        c => c.contentDigest === mark.assetDigest
      );
      if (!asset || asset.revision !== mark.revision) {
        return {
          ok: false,
          error: 'invalid_pin',
          message: 'Marks must bind to immutable asset bytes.',
        };
      }
      if (mark.revision !== current.activeRevision) {
        return {
          ok: false,
          error: 'invalid_pin',
          message: 'Marks must be made on the active revision.',
        };
      }
    }
  }
  if (seenActionIds.has(body.actionId)) {
    return {
      ok: false,
      error: 'duplicate_action',
      message: 'Duplicate command id; prior ack stands.',
    };
  }
  return { ok: true };
}
