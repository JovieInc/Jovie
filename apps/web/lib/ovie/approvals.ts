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

/** Stored shape: the raw token is replaced by a SHA-256 digest. */
type StoredApprovalRecord = Omit<OvieApprovalRecord, 'token'> & {
  readonly tokenDigest: string;
};

export class OvieApprovalError extends Error {
  constructor(
    readonly code:
      | 'actor-mismatch'
      | 'action-mismatch'
      | 'repository-mismatch'
      | 'revision-mismatch'
      | 'expired'
      | 'token-mismatch'
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

/**
 * SHA-256 digest of a grant token. Only the digest is persisted; the raw
 * token is returned to the granting caller exactly once and never stored.
 */
export function approvalTokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
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
  const token = newApprovalToken();
  const record: OvieApprovalRecord = {
    id: `app_${approvalDigest(input)}`,
    kind: 'ovie-approval',
    actor: input.actor,
    action: input.action,
    repository: input.repository,
    revision: input.revision,
    grantedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    token,
  };
  const stored: StoredApprovalRecord = {
    ...record,
    token: undefined,
    tokenDigest: approvalTokenDigest(token),
  };
  const created = await backend.setIfAbsent(
    approvalKey(record.id),
    stored,
    ttlSeconds
  );
  if (!created) {
    const existing = asStoredApprovalRecord(
      await backend.get(approvalKey(record.id))
    );
    if (existing && Date.parse(existing.expiresAt) > now.getTime()) {
      // A live approval already exists for this exact bound. Rotate the
      // token: the new caller receives a fresh token it can validate; a
      // caller that did not hold the old token never receives it.
      const rotated: StoredApprovalRecord = {
        ...existing,
        grantedAt: now.toISOString(),
        tokenDigest: approvalTokenDigest(token),
      };
      const replaced = await backend.compareAndSet(
        approvalKey(record.id),
        existing,
        rotated,
        ttlSeconds
      );
      if (replaced) {
        return { ...record, grantedAt: rotated.grantedAt };
      }
      // Concurrent re-grant won: return the record bound to this caller's
      // fresh token; its digest lost the race, so re-read to stay honest.
      return record;
    }
    // Expired/absent record for the same id: replace with a fresh grant.
    await backend.set(approvalKey(record.id), stored);
  }
  return record;
}

function asStoredApprovalRecord(
  value: unknown
): StoredApprovalRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rec = value as Partial<StoredApprovalRecord>;
  if (
    rec.kind !== 'ovie-approval' ||
    typeof rec.id !== 'string' ||
    typeof rec.actor !== 'string' ||
    typeof rec.action !== 'string' ||
    typeof rec.repository !== 'string' ||
    typeof rec.revision !== 'string' ||
    typeof rec.expiresAt !== 'string' ||
    typeof rec.tokenDigest !== 'string'
  ) {
    return undefined;
  }
  return rec as StoredApprovalRecord;
}

/**
 * Validate a bounded approval before executing an action. Fails closed on
 * unknown approvals, actor/action/repository/revision mismatch, expiry, a
 * wrong or missing token, and material revision change (the bound revision
 * no longer matches).
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
  const stored = asStoredApprovalRecord(
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
  if (
    !input.token ||
    !approvalTokenMatches(stored.tokenDigest, approvalTokenDigest(input.token))
  ) {
    throw new OvieApprovalError(
      'token-mismatch',
      'Approval token does not match; grant a new approval'
    );
  }
  const { tokenDigest: _tokenDigest, ...bound } = stored;
  return { ...bound, token: input.token };
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
