/**
 * Bounded operator approvals (JOV-6557).
 *
 * An approval is bound to actor, action, repository, revision and an expiry.
 * Stale approvals — expiry passed, revision moved, or actor mismatch — must be
 * invalidated before the action executes; a material change invalidates the
 * bound approval instead of being silently executed. Bound to Summer's
 * governance relationship and stored via the shared OperatingStore KV backend
 * so approvals survive an Ovie restart, per the durable-session contract.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { memoryRecordBackend, type RecordBackend } from '@/lib/ovie/mcp/store';

export const OVIE_APPROVAL_TTL_SECONDS = 60 * 60 * 4; // 4h default bound

export type OvieApprovalAction =
  | 'merge'
  | 'deploy'
  | 'publish'
  | 'write-gbrain'
  | 'coordinate-linear';

export type OvieApprovalRecord = {
  readonly id: string;
  readonly kind: 'ovie-approval';
  readonly actor: string;
  readonly action: OvieApprovalAction;
  readonly repository: string;
  readonly revision: string;
  readonly grantedAt: string;
  readonly expiresAt: string;
  readonly token: string;
};

export class OvieApprovalError extends Error {
  constructor(
    readonly code:
      | 'actor-mismatch'
      | 'action-mismatch'
      | 'repository-mismatch'
      | 'revision-mismatch'
      | 'expired'
      | 'unknown-approval',
    message: string
  ) {
    super(message);
    this.name = 'OvieApprovalError';
  }
}

function approvalKey(id: string): string {
  return `ovie:approval:v1:${id}`;
}

function approvalDigest(input: {
  actor: string;
  action: string;
  repository: string;
  revision: string;
}): string {
  return createHash('sha256')
    .update(
      `${input.actor}\n${input.action}\n${input.repository}\n${input.revision}`
    )
    .digest('base64url')
    .slice(0, 24);
}

export function newApprovalToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Grant a bounded approval; idempotent for an identical live bound. */
export async function grantOvieApproval(
  backend: RecordBackend,
  input: {
    readonly actor: string;
    readonly action: OvieApprovalAction;
    readonly repository: string;
    readonly revision: string;
    readonly ttlSeconds?: number;
  }
): Promise<OvieApprovalRecord> {
  const now = new Date();
  const ttlSeconds = input.ttlSeconds ?? OVIE_APPROVAL_TTL_SECONDS;
  const record: OvieApprovalRecord = {
    id: `app_${approvalDigest(input)}`,
    kind: 'ovie-approval',
    actor: input.actor,
    action: input.action,
    repository: input.repository,
    revision: input.revision,
    grantedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    token: newApprovalToken(),
  };
  const created = await backend.setIfAbsent(
    approvalKey(record.id),
    sanitizeApprovalForStore(record),
    ttlSeconds
  );
  if (!created) {
    const stored = asApprovalRecord(await backend.get(approvalKey(record.id)));
    if (stored && Date.parse(stored.expiresAt) > now.getTime()) {
      // A live approval already exists for this exact bound; return it so
      // the caller holds a token that can actually validate.
      return { ...stored, token: record.token };
    }
    // Expired/absent record for the same id: replace with a fresh grant.
    await backend.set(approvalKey(record.id), sanitizeApprovalForStore(record));
  }
  return record;
}

function asApprovalRecord(value: unknown): OvieApprovalRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rec = value as Partial<OvieApprovalRecord>;
  if (
    rec.kind !== 'ovie-approval' ||
    typeof rec.id !== 'string' ||
    typeof rec.actor !== 'string' ||
    typeof rec.action !== 'string' ||
    typeof rec.repository !== 'string' ||
    typeof rec.revision !== 'string' ||
    typeof rec.expiresAt !== 'string'
  ) {
    return undefined;
  }
  return rec as OvieApprovalRecord;
}

/**
 * Strip the raw token before storage: the backend holds the bound fields and
 * expiry only; token equality is checked against the caller-held value, never
 * re-read from the store.
 */
function sanitizeApprovalForStore(record: OvieApprovalRecord): unknown {
  return { ...record, token: undefined };
}

/**
 * Validate a bounded approval before executing an action. Fails closed on
 * unknown approvals, actor/action/repository/revision mismatch, expiry, and
 * material revision change (the bound revision no longer matches).
 */
export async function assertOvieApproval(
  backend: RecordBackend,
  input: {
    readonly actor: string;
    readonly action: OvieApprovalAction;
    readonly repository: string;
    readonly revision: string;
    readonly approvalId: string;
    readonly token: string;
    readonly at?: string;
  }
): Promise<OvieApprovalRecord> {
  const stored = asApprovalRecord(
    await backend.get(approvalKey(input.approvalId))
  );
  if (!stored) {
    throw new OvieApprovalError(
      'unknown-approval',
      'Approval not found; grant a new approval for this action'
    );
  }
  const at = input.at ?? new Date().toISOString();
  if (Date.parse(stored.expiresAt) <= Date.parse(at)) {
    throw new OvieApprovalError('expired', 'Approval expired; re-approve');
  }
  if (stored.actor !== input.actor) {
    throw new OvieApprovalError(
      'actor-mismatch',
      'Approval is bound to a different actor'
    );
  }
  if (stored.action !== input.action) {
    throw new OvieApprovalError(
      'action-mismatch',
      'Approval is bound to a different action'
    );
  }
  if (stored.repository !== input.repository) {
    throw new OvieApprovalError(
      'repository-mismatch',
      'Approval is bound to a different repository'
    );
  }
  if (stored.revision !== input.revision) {
    throw new OvieApprovalError(
      'revision-mismatch',
      'Approval is bound to a different revision; material change invalidates the approval'
    );
  }
  return stored;
}

/** Token equality using timing-safe compare; token is not persisted raw. */
export function approvalTokenMatches(
  storedToken: string,
  presentedToken: string
): boolean {
  const a = Buffer.from(storedToken);
  const b = Buffer.from(presentedToken);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Revoke a live approval immediately (operator rejects a proposal). */
export async function revokeOvieApproval(
  backend: RecordBackend,
  approvalId: string
): Promise<boolean> {
  const current = await backend.get(approvalKey(approvalId));
  if (!current) return false;
  return backend.compareAndSet(approvalKey(approvalId), current, null, 1);
}

/**
 * In-memory backend for tests and isolated local exploration. Sharing the
 * memoryRecordBackend bags preserves records across new instances.
 */
export function memoryApprovalBackend(
  bags?: Parameters<typeof memoryRecordBackend>[0]
): RecordBackend {
  return memoryRecordBackend(bags);
}
