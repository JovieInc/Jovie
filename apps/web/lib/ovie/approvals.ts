/**
 * Bounded Ovie approvals (JOV-6557).
 *
 * An approval is bound to actor, action, repository, revision and expiry. A
 * stale approval (expired, superseded revision, or rebound actor/action) is
 * never valid. Persisted as one OperatingStore decision per approval id so it
 * survives app restart with the session/transcript store. Verifying never
 * confers authority: callers still pass their own founder/MFA gates.
 */

import { createHash } from 'node:crypto';
import { newRecordId, type OperatingStore } from '@/lib/ovie/mcp/store';
import type { OvieDecision } from '@/lib/ovie/mcp/types';

export const OVIE_APPROVAL_DECISION_PREFIX = 'dec_approval_' as const;
export const OVIE_APPROVAL_PROVENANCE = 'bounded-approval' as const;

/** Upper bound on approval lifetime — bounded means bounded. */
export const OVIE_APPROVAL_MAX_TTL_MINUTES = 60;

export type OvieApprovalAction =
  | 'merge'
  | 'push'
  | 'deploy'
  | 'write-gbrain'
  | 'linear-coordination';

export const OVIE_APPROVAL_ACTIONS = [
  'merge',
  'push',
  'deploy',
  'write-gbrain',
  'linear-coordination',
] as const;

export type OvieBoundedApproval = {
  readonly id: string;
  readonly actor: string;
  readonly action: OvieApprovalAction;
  readonly repository: string;
  /** Exact head revision the approval was recorded against. */
  readonly revision: string;
  /** Material diff/revision the approval covers; change invalidates. */
  readonly diffDigest: string;
  readonly expiresAt: string;
  readonly recordedAt: string;
  readonly revokedAt: string | null;
};

export type OvieApprovalVerdict =
  | { readonly valid: true; readonly approval: OvieBoundedApproval }
  | {
      readonly valid: false;
      readonly reason:
        | 'unknown-approval'
        | 'expired'
        | 'revoked'
        | 'actor-mismatch'
        | 'action-mismatch'
        | 'repository-mismatch'
        | 'revision-mismatch';
      readonly approval?: OvieBoundedApproval;
    };

export class OvieApprovalError extends Error {
  constructor(
    readonly code:
      | 'invalid-actor'
      | 'invalid-action'
      | 'invalid-repository'
      | 'invalid-revision'
      | 'invalid-diff-digest'
      | 'invalid-ttl'
      | 'invalid-record'
      | 'write-conflict',
    message: string
  ) {
    super(message);
    this.name = 'OvieApprovalError';
  }
}

function approvalDecisionId(id: string): string {
  return `${OVIE_APPROVAL_DECISION_PREFIX}${id}`;
}

export function ovieApprovalDiffDigest(input: string): string {
  return `sha256:${createHash('sha256').update(input).digest('hex')}`;
}

function toDecision(approval: OvieBoundedApproval): OvieDecision {
  return {
    id: approvalDecisionId(approval.id),
    kind: 'decision',
    decided: JSON.stringify(approval),
    why: `Bounded ${approval.action} approval for ${approval.repository} @ ${approval.revision}`,
    provenance: OVIE_APPROVAL_PROVENANCE,
    constraints: [
      `action:${approval.action}`,
      `repository:${approval.repository}`,
      `revision:${approval.revision}`,
    ],
    affected: [approval.repository],
    createdAt: approval.recordedAt,
  };
}

function fromDecision(record: OvieDecision): OvieBoundedApproval | null {
  if (record.provenance !== OVIE_APPROVAL_PROVENANCE) return null;
  try {
    const value = JSON.parse(record.decided) as Partial<OvieBoundedApproval>;
    if (
      typeof value.id !== 'string' ||
      typeof value.actor !== 'string' ||
      typeof value.action !== 'string' ||
      typeof value.repository !== 'string' ||
      typeof value.revision !== 'string' ||
      typeof value.diffDigest !== 'string' ||
      typeof value.expiresAt !== 'string' ||
      typeof value.recordedAt !== 'string' ||
      (value.revokedAt !== null && typeof value.revokedAt !== 'string')
    ) {
      return null;
    }
    return value as OvieBoundedApproval;
  } catch {
    return null;
  }
}

function requireNonEmpty(
  value: string,
  code: OvieApprovalError['code'] & string,
  label: string
): string {
  const trimmed = value.trim();
  if (!trimmed) throw new OvieApprovalError(code, `${label} is required`);
  return trimmed;
}

export function recordOvieBoundedApproval(
  store: OperatingStore,
  input: {
    readonly id?: string;
    readonly actor: string;
    readonly action: string;
    readonly repository: string;
    readonly revision: string;
    readonly diffDigest: string;
    readonly ttlMinutes?: number;
    readonly now?: Date;
  }
): Promise<OvieBoundedApproval> {
  const actor = requireNonEmpty(input.actor, 'invalid-actor', 'actor');
  if (!(OVIE_APPROVAL_ACTIONS as readonly string[]).includes(input.action)) {
    throw new OvieApprovalError(
      'invalid-action',
      `action must be one of ${OVIE_APPROVAL_ACTIONS.join(', ')}`
    );
  }
  const action = input.action as OvieApprovalAction;
  const repository = requireNonEmpty(
    input.repository,
    'invalid-repository',
    'repository'
  );
  const revision = requireNonEmpty(
    input.revision,
    'invalid-revision',
    'revision'
  );
  const digest = input.diffDigest.trim();
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new OvieApprovalError(
      'invalid-diff-digest',
      'diff_digest must be a sha256:<64 hex> digest'
    );
  }
  const ttl = input.ttlMinutes ?? OVIE_APPROVAL_MAX_TTL_MINUTES;
  if (
    !Number.isInteger(ttl) ||
    ttl < 1 ||
    ttl > OVIE_APPROVAL_MAX_TTL_MINUTES
  ) {
    throw new OvieApprovalError(
      'invalid-ttl',
      `ttl_minutes must be an integer between 1 and ${OVIE_APPROVAL_MAX_TTL_MINUTES}`
    );
  }
  const now = input.now ?? new Date();
  const approval: OvieBoundedApproval = {
    id: input.id?.trim() || newRecordId('dec').replace(/^dec_/, ''),
    actor,
    action,
    repository,
    revision,
    diffDigest: digest,
    expiresAt: new Date(now.getTime() + ttl * 60_000).toISOString(),
    recordedAt: now.toISOString(),
    revokedAt: null,
  };
  return putOvieApproval(store, approval);
}

async function putOvieApproval(
  store: OperatingStore,
  approval: OvieBoundedApproval
): Promise<OvieBoundedApproval> {
  const decisionId = approvalDecisionId(approval.id);
  const existing = await store.getDecision(decisionId);
  if (existing) {
    const prior = fromDecision(existing);
    if (!prior) {
      throw new OvieApprovalError(
        'invalid-record',
        `approval ${approval.id} exists with a different shape`
      );
    }
    if (prior.revokedAt) {
      throw new OvieApprovalError(
        'write-conflict',
        `approval ${approval.id} was revoked and cannot be re-recorded`
      );
    }
    const sameBounds =
      prior.actor === approval.actor &&
      prior.action === approval.action &&
      prior.repository === approval.repository &&
      prior.revision === approval.revision &&
      prior.diffDigest === approval.diffDigest;
    if (!sameBounds) {
      throw new OvieApprovalError(
        'write-conflict',
        `approval ${approval.id} is already bound to different actor, action, repository, revision or diff digest`
      );
    }
    return prior;
  }
  const updated = await store.putDecisionIfUnchanged(
    toDecision(approval),
    undefined
  );
  if (!updated) {
    const raced = await store.getDecision(decisionId);
    const racedApproval = raced ? fromDecision(raced) : null;
    if (!racedApproval) {
      throw new OvieApprovalError(
        'write-conflict',
        `approval ${approval.id} was created concurrently in another shape`
      );
    }
    return racedApproval;
  }
  return approval;
}

export async function getOvieBoundedApproval(
  store: OperatingStore,
  id: string
): Promise<OvieBoundedApproval | null> {
  const record = await store.getDecision(approvalDecisionId(id.trim()));
  if (!record) return null;
  return fromDecision(record);
}

export async function revokeOvieBoundedApproval(
  store: OperatingStore,
  id: string,
  now: Date = new Date()
): Promise<OvieBoundedApproval | null> {
  const decisionId = approvalDecisionId(id.trim());
  const current = await store.getDecisionForUpdate(decisionId);
  if (!current) return null;
  const approval = fromDecision(current);
  if (!approval) {
    throw new OvieApprovalError(
      'invalid-record',
      `approval ${id} exists with a different shape`
    );
  }
  if (approval.revokedAt) return approval;
  const revoked: OvieBoundedApproval = {
    ...approval,
    revokedAt: now.toISOString(),
  };
  const updated = await store.putDecisionIfUnchanged(
    toDecision(revoked),
    current
  );
  if (!updated) {
    const raced = await store.getDecisionForUpdate(decisionId);
    const racedApproval = raced ? fromDecision(raced) : null;
    if (racedApproval?.revokedAt) return racedApproval;
    throw new OvieApprovalError(
      'write-conflict',
      `approval ${id} changed too frequently to revoke`
    );
  }
  return revoked;
}

export function verifyOvieBoundedApproval(
  approval: OvieBoundedApproval | null,
  input: {
    readonly actor: string;
    readonly action: string;
    readonly repository: string;
    readonly revision?: string;
    readonly diffDigest?: string;
    readonly now?: Date;
  }
): OvieApprovalVerdict {
  const now = input.now ?? new Date();
  if (!approval) {
    return { valid: false, reason: 'unknown-approval' };
  }
  if (approval.revokedAt) {
    return { valid: false, reason: 'revoked', approval };
  }
  if (Date.parse(approval.expiresAt) <= now.getTime()) {
    return { valid: false, reason: 'expired', approval };
  }
  if (approval.actor !== input.actor.trim()) {
    return { valid: false, reason: 'actor-mismatch', approval };
  }
  if (approval.action !== input.action) {
    return { valid: false, reason: 'action-mismatch', approval };
  }
  if (approval.repository !== input.repository.trim()) {
    return { valid: false, reason: 'repository-mismatch', approval };
  }
  if (input.revision && approval.revision !== input.revision.trim()) {
    return { valid: false, reason: 'revision-mismatch', approval };
  }
  if (input.diffDigest && approval.diffDigest !== input.diffDigest.trim()) {
    return { valid: false, reason: 'revision-mismatch', approval };
  }
  return { valid: true, approval };
}
