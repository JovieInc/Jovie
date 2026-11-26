import type {
  ReviewInboxCommand,
  ReviewInboxComment,
  ReviewInboxDecisionBody,
  ReviewInboxDecisionReceipt,
  ReviewInboxPilotCase,
  ReviewInboxPin,
  ReviewInboxStroke,
} from './contract';
import {
  REVIEW_INBOX_DECISION_CONTRACT,
  REVIEW_INBOX_PILOT_TENANT,
} from './contract';
import { gateReviewDecision, type ReviewInboxGateFailure } from './gates';
import { withAuthor } from './marks';
import { createPilotReviewCase } from './pilot-fixture';

/**
 * Durable review ledger. One record per tenant + principal + case holds the
 * case (pins, strokes and comments keyed by asset digest + revision), the
 * seen action ids and their receipts. Writes are compare-and-set on the
 * record's integer revision, so a restart, a second instance or a second tab
 * never loses or double-applies a decision.
 */
export const REVIEW_INBOX_LEDGER_SCHEMA =
  'jovie.review-inbox-ledger/v1' as const;
const KEY_PREFIX = 'review-inbox:';
const MAX_CAS_ATTEMPTS = 3;
const MAX_RECEIPTS = 200;

export interface ReviewInboxScope {
  readonly tenant: typeof REVIEW_INBOX_PILOT_TENANT;
  /** Signed-in operator; never taken from the request body. */
  readonly principalId: string;
  readonly caseId: typeof REVIEW_INBOX_PILOT_TENANT;
}

interface StoredReceipt {
  readonly actionId: string;
  readonly command: ReviewInboxCommand;
  readonly revision: string;
  readonly at: string;
}

export interface ReviewInboxLedgerRecord {
  readonly schema: typeof REVIEW_INBOX_LEDGER_SCHEMA;
  /** CAS token; strictly increases on every write. */
  readonly revision: number;
  readonly scope: ReviewInboxScope;
  readonly case: ReviewInboxPilotCase;
  readonly receipts: readonly StoredReceipt[];
}

/** Same shape as the reference-review KV repository (ovie_operating_kv). */
export interface ReviewInboxRepository {
  read(key: string): Promise<unknown | null>;
  compareAndSet(
    key: string,
    expectedRevision: number | null,
    value: ReviewInboxLedgerRecord
  ): Promise<boolean>;
}

export type ReviewInboxApplyResult =
  | { readonly ok: true; readonly receipt: ReviewInboxDecisionReceipt }
  | {
      readonly ok: false;
      readonly status: 409 | 400 | 422;
      readonly error: ReviewInboxGateFailure | 'write_conflict';
      readonly message: string;
    };

export function reviewInboxScopeKey(scope: ReviewInboxScope): string {
  return `${KEY_PREFIX}${scope.tenant}:${encodeURIComponent(scope.principalId)}:${scope.caseId}`;
}

export function pilotReviewInboxScope(principalId: string): ReviewInboxScope {
  if (!principalId)
    throw new Error('Review inbox needs a signed-in principal.');
  return {
    tenant: REVIEW_INBOX_PILOT_TENANT,
    principalId,
    caseId: REVIEW_INBOX_PILOT_TENANT,
  };
}

function sameScope(a: ReviewInboxScope, b: ReviewInboxScope): boolean {
  return (
    a.tenant === b.tenant &&
    a.principalId === b.principalId &&
    a.caseId === b.caseId
  );
}

function parseRecord(
  raw: unknown,
  scope: ReviewInboxScope
): ReviewInboxLedgerRecord | null {
  if (raw === null || raw === undefined) return null;
  const value = raw as Partial<ReviewInboxLedgerRecord>;
  if (
    value.schema !== REVIEW_INBOX_LEDGER_SCHEMA ||
    typeof value.revision !== 'number' ||
    !value.scope ||
    !value.case ||
    !Array.isArray(value.receipts)
  ) {
    throw new Error('Stored review inbox record is invalid.');
  }
  // Scope is encoded in the key and verified in the value.
  if (!sameScope(value.scope, scope)) {
    throw new Error('Stored review inbox record belongs to another scope.');
  }
  const stored = value.case;
  return {
    ...(value as ReviewInboxLedgerRecord),
    // Records written before strokes/comments existed read as empty lists.
    case: {
      ...stored,
      pins: stored.pins ?? [],
      strokes: stored.strokes ?? [],
      comments: stored.comments ?? [],
    },
  };
}

function statusFor(error: ReviewInboxGateFailure): 409 | 400 | 422 {
  if (error === 'stale_revision' || error === 'duplicate_action') return 409;
  if (error === 'invalid_contract' || error === 'forbidden_tenant') return 400;
  return 422;
}

function nextCase(
  current: ReviewInboxPilotCase,
  body: ReviewInboxDecisionBody
): ReviewInboxPilotCase {
  switch (body.command) {
    case 'request_changes': {
      const pins: ReviewInboxPin[] = withAuthor(body.pins ?? [], 'founder');
      const strokes: ReviewInboxStroke[] = withAuthor(
        body.strokes ?? [],
        'founder'
      );
      const comments: ReviewInboxComment[] = [];
      const note = body.notes?.trim();
      if (note) {
        comments.push({
          id: `${body.actionId}-comment`,
          revision: body.revision,
          body: note,
          author: 'founder',
        });
      }
      // Synthetic pilot designer: v2 answers each v1 pin at the same spot.
      const agentResponses: ReviewInboxPin[] = pins.map(pin => ({
        ...pin,
        id: `${pin.id}-response`,
        revision: 'v2',
        assetDigest:
          current.candidates.find(c => c.revision === 'v2')?.contentDigest ??
          pin.assetDigest,
        note: `Addressed: ${pin.note}`,
        author: 'agent',
      }));
      comments.push({
        id: `${body.actionId}-response`,
        revision: 'v2',
        body: `v2 answers ${pins.length} pin${pins.length === 1 ? '' : 's'} and ${strokes.length} drawn mark${strokes.length === 1 ? '' : 's'} from ${body.revision}.`,
        author: 'agent',
      });
      return {
        ...current,
        lifecycle: 'changes_requested',
        activeRevision: 'v2',
        pins: [...current.pins, ...pins, ...agentResponses],
        strokes: [...current.strokes, ...strokes],
        comments: [...current.comments, ...comments],
        recommendation:
          'v2 includes responses to your v1 marks. Accept v2 to store in the private test library.',
      };
    }
    case 'accept_version':
      return {
        ...current,
        lifecycle: 'accepted',
        activeRevision: 'v2',
        acceptedRevision: 'v2',
        state: 'disposed',
        privateLibraryReceipt: `synthetic-test-library:v2:${body.actionId}`,
      };
    default:
      // favorite records a receipt only; publish/spend never pass the gate.
      return current;
  }
}

function toReceipt(
  stored: StoredReceipt,
  reviewCase: ReviewInboxPilotCase
): ReviewInboxDecisionReceipt {
  return {
    contract: REVIEW_INBOX_DECISION_CONTRACT,
    actionId: stored.actionId,
    command: stored.command,
    revision: stored.revision,
    ack: true,
    case: structuredClone(reviewCase),
  };
}

export function createReviewInboxLedger(
  repository: ReviewInboxRepository,
  clock: () => Date = () => new Date()
) {
  async function load(scope: ReviewInboxScope) {
    const record = parseRecord(
      await repository.read(reviewInboxScopeKey(scope)),
      scope
    );
    return record;
  }

  return {
    async readCase(scope: ReviewInboxScope): Promise<ReviewInboxPilotCase> {
      const record = await load(scope);
      return structuredClone(
        record?.case ?? createPilotReviewCase(clock().toISOString())
      );
    },

    /** Missing ack: callers read receipts instead of retrying blindly. */
    async receiptFor(
      scope: ReviewInboxScope,
      actionId: string
    ): Promise<ReviewInboxDecisionReceipt | null> {
      const record = await load(scope);
      const stored = record?.receipts.find(r => r.actionId === actionId);
      return record && stored ? toReceipt(stored, record.case) : null;
    },

    async apply(
      scope: ReviewInboxScope,
      body: ReviewInboxDecisionBody
    ): Promise<ReviewInboxApplyResult> {
      const key = reviewInboxScopeKey(scope);
      for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
        const record = await load(scope);
        const current =
          record?.case ?? createPilotReviewCase(clock().toISOString());
        const seen = new Set(record?.receipts.map(r => r.actionId) ?? []);
        const gate = gateReviewDecision(current, body, seen);
        if (!gate.ok) {
          return {
            ok: false,
            status: statusFor(gate.error),
            error: gate.error,
            message: gate.message,
          };
        }
        const next = nextCase(current, body);
        const stored: StoredReceipt = {
          actionId: body.actionId,
          command: body.command,
          revision: body.revision,
          at: clock().toISOString(),
        };
        const value: ReviewInboxLedgerRecord = {
          schema: REVIEW_INBOX_LEDGER_SCHEMA,
          revision: (record?.revision ?? 0) + 1,
          scope,
          case: next,
          receipts: [...(record?.receipts ?? []), stored].slice(-MAX_RECEIPTS),
        };
        if (
          await repository.compareAndSet(key, record?.revision ?? null, value)
        ) {
          return { ok: true, receipt: toReceipt(stored, next) };
        }
      }
      return {
        ok: false,
        status: 409,
        error: 'write_conflict',
        message: 'Another review changed this item. Reload and try again.',
      };
    },
  };
}

export type ReviewInboxLedger = ReturnType<typeof createReviewInboxLedger>;
