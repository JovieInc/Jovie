/**
 * Bounded agent approvals (JOV-6557).
 *
 * An approval is bound to actor, action, repository, branch, head SHA and
 * expiry. A material change (a new head SHA on the same repository +
 * branch, a different actor, or elapsed time) makes the prior approval
 * stale — stale approvals never authorize. Consume is single-shot and
 * guarded by compare-and-set: a consumed approval cannot authorize a
 * second action.
 *
 * Persisted on the existing RecordBackend (Redis primary / Postgres
 * fallback) in the operating store's key namespace family. No new service,
 * no second inbox, no workflow engine.
 */

import { randomBytes } from 'node:crypto';
import type { RecordBackend } from '@/lib/ovie/mcp/store';

export const APPROVAL_SCHEMA = 'jovie.ovie.bounded-approval/v1' as const;

export const APPROVAL_ACTIONS = [
  'publish-company-code',
  'request-merge',
  'push-branch',
] as const;

export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export type OvieApproval = {
  readonly schema: typeof APPROVAL_SCHEMA;
  readonly id: string;
  readonly kind: 'approval';
  /** Authenticated principal who granted the approval. */
  readonly actor: string;
  readonly action: ApprovalAction;
  readonly repository: string;
  /** Branch the approval is bound to. */
  readonly branch: string;
  /** Exact head SHA the approval covers. A moved head is a material change. */
  readonly headSha: string;
  /** ISO timestamp after which the approval is stale. */
  readonly expiresAt: string;
  readonly grantedAt: string;
  /** Set when the approval authorized an action or was revoked. */
  readonly consumedAt?: string;
};

export type ApprovalRequest = {
  readonly actor: string;
  readonly action: ApprovalAction;
  readonly repository: string;
  readonly branch: string;
  readonly headSha: string;
  readonly expiresAt: string;
};

export type ApprovalCheck = {
  readonly action: ApprovalAction;
  readonly repository: string;
  readonly branch: string;
  readonly headSha: string;
  readonly actor?: string;
};

export type ApprovalDecision =
  | {
      readonly outcome: 'granted';
      readonly approval: OvieApproval;
    }
  | {
      readonly outcome:
        | 'missing'
        | 'expired'
        | 'stale-head'
        | 'actor-mismatch'
        | 'already-consumed';
      readonly reason: string;
    };

export function isApprovalAction(value: unknown): value is ApprovalAction {
  return (
    typeof value === 'string' &&
    (APPROVAL_ACTIONS as readonly string[]).includes(value)
  );
}

export function newApprovalId(): string {
  return `apr_${randomBytes(9).toString('base64url')}`;
}

function approvalKey(id: string): string {
  return `ovie:mcp:v1:approval:${id}`;
}

function bindingIndexKey(
  action: ApprovalAction,
  repository: string,
  branch: string
): string {
  return `ovie:mcp:v1:approval-index:${action}:${repository}:${branch}`;
}

export function asApproval(value: unknown): OvieApproval | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rec = value as Partial<OvieApproval>;
  if (rec.schema !== APPROVAL_SCHEMA || rec.kind !== 'approval')
    return undefined;
  if (typeof rec.id !== 'string' || !rec.id) return undefined;
  if (!isApprovalAction(rec.action)) return undefined;
  if (typeof rec.actor !== 'string' || !rec.actor) return undefined;
  if (typeof rec.repository !== 'string' || !rec.repository) return undefined;
  if (typeof rec.branch !== 'string' || !rec.branch) return undefined;
  if (
    typeof rec.headSha !== 'string' ||
    !/^[0-9a-f]{7,40}$/i.test(rec.headSha)
  ) {
    return undefined;
  }
  if (
    typeof rec.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(rec.expiresAt))
  ) {
    return undefined;
  }
  if (
    typeof rec.grantedAt !== 'string' ||
    !Number.isFinite(Date.parse(rec.grantedAt))
  ) {
    return undefined;
  }
  return rec as OvieApproval;
}

function isExpired(approval: OvieApproval, nowMs: number): boolean {
  return Date.parse(approval.expiresAt) <= nowMs;
}

function nowIso(nowMs?: number): string {
  return new Date(nowMs ?? Date.now()).toISOString();
}

export class ApprovalError extends Error {
  constructor(
    readonly code:
      | 'invalid-actor'
      | 'invalid-repository'
      | 'invalid-branch'
      | 'invalid-head-sha'
      | 'invalid-expiry',
    message: string
  ) {
    super(message);
    this.name = 'ApprovalError';
  }
}

function validateRequest(request: ApprovalRequest): void {
  if (!request.actor.trim())
    throw new ApprovalError('invalid-actor', 'actor is required');
  if (!request.repository.trim())
    throw new ApprovalError('invalid-repository', 'repository is required');
  if (!request.branch.trim())
    throw new ApprovalError('invalid-branch', 'branch is required');
  if (!/^[0-9a-f]{7,40}$/i.test(request.headSha))
    throw new ApprovalError(
      'invalid-head-sha',
      'headSha must be a 7-40 hex char commit sha'
    );
  if (!Number.isFinite(Date.parse(request.expiresAt)))
    throw new ApprovalError(
      'invalid-expiry',
      'expiresAt must be an ISO timestamp'
    );
}

/**
 * Grant a bounded approval and index it under its binding. Re-granting the
 * same binding at a new head SHA supersedes the prior approval: lookups
 * prefer the latest granted, and checking an older approval against the
 * current head reports a stale-head mismatch.
 */
export async function grantApproval(
  backend: RecordBackend,
  request: ApprovalRequest,
  grantedAtIso?: string
): Promise<OvieApproval> {
  validateRequest(request);
  const approval: OvieApproval = {
    schema: APPROVAL_SCHEMA,
    id: newApprovalId(),
    kind: 'approval',
    actor: request.actor,
    action: request.action,
    repository: request.repository,
    branch: request.branch,
    headSha: request.headSha.toLowerCase(),
    expiresAt: request.expiresAt,
    grantedAt: grantedAtIso ?? nowIso(),
  };
  const ttlSeconds = Math.max(
    1,
    Math.ceil((Date.parse(approval.expiresAt) - Date.now()) / 1000)
  );
  await backend.setIfAbsent(approvalKey(approval.id), approval, ttlSeconds);
  await backend.lpush(
    bindingIndexKey(approval.action, approval.repository, approval.branch),
    approval.id
  );
  return approval;
}

/** Revoke: the backend cannot delete, so mark consumed. */
export async function revokeApproval(
  backend: RecordBackend,
  id: string,
  revokedAtIso?: string
): Promise<OvieApproval | undefined> {
  const existing = asApproval(await backend.get(approvalKey(id)));
  if (!existing) return undefined;
  const next: OvieApproval = {
    ...existing,
    consumedAt: revokedAtIso ?? nowIso(),
  };
  await backend.set(approvalKey(id), next);
  return next;
}

/** Latest approval for the binding (consumed or not), or undefined. */
async function findLatestApproval(
  backend: RecordBackend,
  check: ApprovalCheck
): Promise<OvieApproval | undefined> {
  const ids = await backend.lrange(
    bindingIndexKey(check.action, check.repository, check.branch),
    0,
    -1
  );
  const rows = await Promise.all(ids.map(id => backend.get(approvalKey(id))));
  const approvals = rows
    .map(asApproval)
    .filter((row): row is OvieApproval => Boolean(row));
  if (approvals.length === 0) return undefined;
  return approvals.sort(
    (a, b) => Date.parse(b.grantedAt) - Date.parse(a.grantedAt)
  )[0];
}

/**
 * Evaluate a binding against its latest approval, without consuming it.
 * A consumed approval still reads 'granted' for a read-only check — only
 * consume is single-shot. Decision ordering: missing → expired →
 * stale-head → actor-mismatch → granted.
 */
export async function checkApproval(
  backend: RecordBackend,
  check: ApprovalCheck,
  nowMs?: number
): Promise<ApprovalDecision> {
  const current = await findLatestApproval(backend, check);
  if (!current) {
    return {
      outcome: 'missing',
      reason: 'no approval granted for this actor/action/repository/branch',
    };
  }
  const now = nowMs ?? Date.now();
  if (isExpired(current, now)) {
    return {
      outcome: 'expired',
      reason: `approval expired at ${current.expiresAt}`,
    };
  }
  if (current.headSha !== check.headSha.toLowerCase()) {
    return {
      outcome: 'stale-head',
      reason: `approval bound to head ${current.headSha}; current head is ${check.headSha.toLowerCase()}`,
    };
  }
  if (check.actor && current.actor !== check.actor) {
    return {
      outcome: 'actor-mismatch',
      reason: `approval bound to actor ${current.actor}`,
    };
  }
  return { outcome: 'granted', approval: current };
}

/**
 * Consume the approval for an action: single-shot authorization. A
 * consumed approval returns 'already-consumed' and never authorizes a
 * second action. Compare-and-set guards against two workers consuming
 * the same approval concurrently.
 */
export async function consumeApproval(
  backend: RecordBackend,
  check: ApprovalCheck,
  consumedAtIso?: string,
  nowMs?: number
): Promise<ApprovalDecision> {
  const current = await findLatestApproval(backend, check);
  if (!current) {
    return {
      outcome: 'missing',
      reason: 'no approval granted for this actor/action/repository/branch',
    };
  }
  if (current.consumedAt) {
    return {
      outcome: 'already-consumed',
      reason: `approval was consumed at ${current.consumedAt}`,
    };
  }
  const now = nowMs ?? Date.now();
  if (isExpired(current, now)) {
    return {
      outcome: 'expired',
      reason: `approval expired at ${current.expiresAt}`,
    };
  }
  if (current.headSha !== check.headSha.toLowerCase()) {
    return {
      outcome: 'stale-head',
      reason: `approval bound to head ${current.headSha}; current head is ${check.headSha.toLowerCase()}`,
    };
  }
  if (check.actor && current.actor !== check.actor) {
    return {
      outcome: 'actor-mismatch',
      reason: `approval bound to actor ${current.actor}`,
    };
  }
  const consumed: OvieApproval = {
    ...current,
    consumedAt: consumedAtIso ?? nowIso(now),
  };
  const ttlSeconds = Math.max(
    1,
    Math.ceil((Date.parse(current.expiresAt) - now) / 1000)
  );
  const updated = await backend.compareAndSet(
    approvalKey(current.id),
    current,
    consumed,
    ttlSeconds
  );
  if (!updated) {
    // Lost the CAS race: report the winner's state.
    const winner = asApproval(await backend.get(approvalKey(current.id)));
    if (winner?.consumedAt) {
      return {
        outcome: 'already-consumed',
        reason: `approval was consumed at ${winner.consumedAt}`,
      };
    }
    return {
      outcome: 'stale-head',
      reason: 'approval changed concurrently; re-check before retrying',
    };
  }
  return { outcome: 'granted', approval: consumed };
}
