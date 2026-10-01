/**
 * Bounded operator approvals for the Ovie daily-driver surface (JOV-6557).
 *
 * Every approval is bound to actor, action, repository, revision, and expiry.
 * A material change (different actor/action/repository/revision after grant)
 * invalidates the approval instead of silently extending it. Persistence
 * reuses the OperatingStore decision records the Summer session already
 * uses, so approvals survive app restart with no new store.
 */

import { newRecordId, type OperatingStore } from '@/lib/ovie/mcp/store';
import type { OvieDecision } from '@/lib/ovie/mcp/types';

export const BOUNDED_APPROVAL_SCHEMA =
  'jovie.ovie.bounded-approval/v1' as const;

export const BOUNDED_APPROVAL_DECISION_PREFIX = 'bounded-approval:' as const;

export const BOUNDED_APPROVAL_ACTIONS = [
  'publish-company-code',
  'merge-pr',
  'deploy-production',
] as const;

export type BoundedApprovalAction = (typeof BOUNDED_APPROVAL_ACTIONS)[number];

export const BOUNDED_APPROVAL_MAX_TTL_MS = (15 * 60 * 1000) as const;

export type BoundedApprovalStatus =
  | 'valid'
  | 'expired'
  | 'revoked'
  | 'material-change'
  | 'unknown-approval';

export type BoundedApproval = {
  readonly schema: typeof BOUNDED_APPROVAL_SCHEMA;
  readonly id: string;
  readonly action: BoundedApprovalAction;
  readonly actor: string;
  readonly repository: string;
  /** Exact revision (commit sha) the approval was granted against. */
  readonly revision: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly revocation?: string;
  readonly createdAt: string;
};

export type BoundedApprovalInput = {
  readonly action: BoundedApprovalAction;
  readonly actor: string;
  readonly repository: string;
  readonly revision: string;
  readonly grantedAt: string;
  readonly ttlMs: number;
  readonly id?: string;
};

export type BoundedApprovalCheck = {
  readonly action: BoundedApprovalAction;
  readonly actor: string;
  readonly repository: string;
  readonly revision: string;
};

export type BoundedApprovalDecision =
  | {
      readonly status: 'valid';
      readonly approval: BoundedApproval;
      readonly reason: null;
    }
  | {
      readonly status: Exclude<BoundedApprovalStatus, 'valid'>;
      readonly approval: BoundedApproval | null;
      readonly reason: string;
    };

export class BoundedApprovalError extends Error {
  constructor(
    readonly code:
      | 'invalid-action'
      | 'missing-bound'
      | 'invalid-ttl'
      | 'invalid-revision',
    message: string
  ) {
    super(message);
    this.name = 'BoundedApprovalError';
  }
}

export function isBoundedApprovalAction(
  value: unknown
): value is BoundedApprovalAction {
  return (
    typeof value === 'string' &&
    (BOUNDED_APPROVAL_ACTIONS as readonly string[]).includes(value)
  );
}

function isExactRevision(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value);
}

function boundValue(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BoundedApprovalError(
      'missing-bound',
      `${field} is required for a bounded approval`
    );
  }
  return trimmed;
}

export function buildBoundedApproval(
  input: BoundedApprovalInput
): BoundedApproval {
  const action = input.action;
  if (!isBoundedApprovalAction(action)) {
    throw new BoundedApprovalError(
      'invalid-action',
      `action must be one of ${BOUNDED_APPROVAL_ACTIONS.join(', ')}`
    );
  }
  const actor = boundValue(input.actor, 'actor');
  const repository = boundValue(input.repository, 'repository');
  const revision = boundValue(input.revision, 'revision');
  if (!isExactRevision(revision)) {
    throw new BoundedApprovalError(
      'invalid-revision',
      'revision must be an exact 40-char commit sha'
    );
  }
  if (
    !Number.isSafeInteger(input.ttlMs) ||
    input.ttlMs <= 0 ||
    input.ttlMs > BOUNDED_APPROVAL_MAX_TTL_MS
  ) {
    throw new BoundedApprovalError(
      'invalid-ttl',
      `ttlMs must be between 1 and ${BOUNDED_APPROVAL_MAX_TTL_MS}`
    );
  }
  const grantedAtMs = Date.parse(input.grantedAt);
  if (!Number.isFinite(grantedAtMs)) {
    throw new BoundedApprovalError(
      'missing-bound',
      'grantedAt must be a valid ISO timestamp'
    );
  }
  return {
    schema: BOUNDED_APPROVAL_SCHEMA,
    id:
      input.id?.trim() ||
      `${BOUNDED_APPROVAL_DECISION_PREFIX}${newRecordId('dec')}`,
    action,
    actor,
    repository,
    revision,
    grantedAt: input.grantedAt,
    expiresAt: new Date(grantedAtMs + input.ttlMs).toISOString(),
    createdAt: input.grantedAt,
  };
}

function approvalKey(
  action: BoundedApprovalAction,
  actor: string,
  repository: string
): string {
  return `${BOUNDED_APPROVAL_DECISION_PREFIX}${action}:${actor}:${repository}`;
}

function toDecision(approval: BoundedApproval): OvieDecision {
  return {
    id: approvalKey(approval.action, approval.actor, approval.repository),
    kind: 'decision',
    decided: JSON.stringify(approval),
    why: `Bounded ${approval.action} approval for ${approval.actor} on ${approval.repository} at ${approval.revision}`,
    provenance: 'bounded-approval',
    constraints: [
      `actor:${approval.actor}`,
      `action:${approval.action}`,
      `repository:${approval.repository}`,
      `revision:${approval.revision}`,
      `expiresAt:${approval.expiresAt}`,
    ],
    affected: [approval.repository],
    createdAt: approval.createdAt,
  };
}

function parseApproval(value: unknown): BoundedApproval | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Partial<BoundedApproval>;
  if (row.schema !== BOUNDED_APPROVAL_SCHEMA) return null;
  if (!isBoundedApprovalAction(row.action)) return null;
  if (
    typeof row.actor !== 'string' ||
    typeof row.repository !== 'string' ||
    typeof row.revision !== 'string'
  ) {
    return null;
  }
  return value as BoundedApproval;
}

function findMaterialChange(
  approval: BoundedApproval,
  check: BoundedApprovalCheck
): string | null {
  if (check.actor !== approval.actor) {
    return `actor changed: approval bound to ${approval.actor}, checked as ${check.actor}`;
  }
  if (check.action !== approval.action) {
    return `action changed: approval bound to ${approval.action}, checked as ${check.action}`;
  }
  if (check.repository !== approval.repository) {
    return `repository changed: approval bound to ${approval.repository}, checked as ${check.repository}`;
  }
  if (check.revision !== approval.revision) {
    return `revision changed: approval bound to ${approval.revision}, checked as ${check.revision}`;
  }
  return null;
}

/**
 * Evaluate a check against a stored approval. A later material change
 * invalidates; expiry is checked against the evaluation time.
 */
export function evaluateBoundedApproval(
  approval: BoundedApproval | null,
  check: BoundedApprovalCheck,
  nowMs: number
): BoundedApprovalDecision {
  if (!approval) {
    return {
      status: 'unknown-approval',
      approval: null,
      reason: 'no stored approval for this actor/action/repository',
    };
  }
  const materialChange = findMaterialChange(approval, check);
  if (materialChange) {
    return { status: 'material-change', approval, reason: materialChange };
  }
  if (approval.revocation) {
    return {
      status: 'revoked',
      approval,
      reason: `approval revoked at ${approval.revocation}`,
    };
  }
  if (Date.parse(approval.expiresAt) <= nowMs) {
    return {
      status: 'expired',
      approval,
      reason: `approval expired at ${approval.expiresAt}`,
    };
  }
  return { status: 'valid', approval, reason: null };
}

export async function grantBoundedApproval(
  store: OperatingStore,
  input: BoundedApprovalInput
): Promise<BoundedApproval> {
  const approval = buildBoundedApproval(input);
  await store.putDecision(toDecision(approval));
  return approval;
}

export async function loadBoundedApproval(
  store: OperatingStore,
  check: Pick<BoundedApprovalCheck, 'action' | 'actor' | 'repository'>
): Promise<BoundedApproval | null> {
  const row = await store.getDecision(
    approvalKey(check.action, check.actor, check.repository)
  );
  if (!row?.decided) return null;
  try {
    return parseApproval(JSON.parse(row.decided));
  } catch {
    return null;
  }
}

export async function checkBoundedApproval(
  store: OperatingStore,
  check: BoundedApprovalCheck,
  nowMs: number = Date.now()
): Promise<BoundedApprovalDecision> {
  const approval = await loadBoundedApproval(store, check);
  return evaluateBoundedApproval(approval, check, nowMs);
}

export async function revokeBoundedApproval(
  store: OperatingStore,
  check: Pick<BoundedApprovalCheck, 'action' | 'actor' | 'repository'>,
  nowMs: number = Date.now()
): Promise<BoundedApproval | null> {
  const existing = await loadBoundedApproval(store, check);
  if (!existing || existing.revocation) return existing;
  const revoked: BoundedApproval = {
    ...existing,
    revocation: new Date(nowMs).toISOString(),
  };
  await store.putDecision(toDecision(revoked));
  return revoked;
}
