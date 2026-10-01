import { describe, expect, it } from 'vitest';
import {
  getOvieBoundedApproval,
  OVIE_APPROVAL_ACTIONS,
  OVIE_APPROVAL_MAX_TTL_MINUTES,
  OvieApprovalError,
  ovieApprovalDiffDigest,
  recordOvieBoundedApproval,
  revokeOvieBoundedApproval,
  verifyOvieBoundedApproval,
} from '@/lib/ovie/approvals';
import {
  DurableOperatingStore,
  MemoryOperatingStore,
  memoryRecordBackend,
  type RecordBackend,
} from '@/lib/ovie/mcp/store';

const ACTOR = 'founder_1';
const REPOSITORY = 'JovieInc/Jovie';
const REVISION = 'a'.repeat(40);
const DIGEST = ovieApprovalDiffDigest('diff-bytes-v1');

function record(
  store: Parameters<typeof recordOvieBoundedApproval>[0],
  overrides: Record<string, unknown> = {}
) {
  return recordOvieBoundedApproval(store, {
    actor: ACTOR,
    action: 'merge',
    repository: REPOSITORY,
    revision: REVISION,
    diffDigest: DIGEST,
    ...overrides,
  });
}

describe('bounded Ovie approvals (JOV-6557)', () => {
  it('records an approval bound to actor, action, repository, revision and expiry', async () => {
    const store = new MemoryOperatingStore();
    const approval = await record(store, { id: 'approval_1' });
    expect(approval).toMatchObject({
      id: 'approval_1',
      actor: ACTOR,
      action: 'merge',
      repository: REPOSITORY,
      revision: REVISION,
      diffDigest: DIGEST,
      revokedAt: null,
    });
    expect(Date.parse(approval.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('survives restart: a new store instance over the same backend reads the approval', async () => {
    const backend = memoryRecordBackend();
    const first = new MemoryOperatingStore(backend);
    await record(first, { id: 'approval_restart' });
    const restarted = new DurableOperatingStore(backend as RecordBackend);
    const read = await getOvieBoundedApproval(restarted, 'approval_restart');
    expect(read?.id).toBe('approval_restart');
    expect(read?.diffDigest).toBe(DIGEST);
  });

  it('is idempotent: re-recording the same id and bounds returns the stored approval without extending expiry', async () => {
    const store = new MemoryOperatingStore();
    const now = new Date('2026-09-26T00:00:00.000Z');
    const first = await record(store, { id: 'approval_idem', now });
    const reRecorded = await recordOvieBoundedApproval(store, {
      actor: ACTOR,
      action: 'merge',
      repository: REPOSITORY,
      revision: REVISION,
      diffDigest: DIGEST,
      id: 'approval_idem',
      now: new Date('2026-09-26T00:30:00.000Z'),
    });
    expect(reRecorded.expiresAt).toBe(first.expiresAt);
  });

  it('fails closed when the same id is re-recorded with different bounds', async () => {
    const store = new MemoryOperatingStore();
    await record(store, { id: 'approval_rebound' });
    await expect(
      record(store, {
        id: 'approval_rebound',
        revision: 'c'.repeat(40),
      })
    ).rejects.toThrow(OvieApprovalError);
    const stored = await getOvieBoundedApproval(store, 'approval_rebound');
    expect(stored?.revision).toBe(REVISION);
  });

  it('verifies a matching approval and rejects every bound mismatch', async () => {
    const store = new MemoryOperatingStore();
    const approval = await record(store, { id: 'approval_verify' });
    expect(
      verifyOvieBoundedApproval(approval, {
        actor: ACTOR,
        action: 'merge',
        repository: REPOSITORY,
        revision: REVISION,
        diffDigest: DIGEST,
      })
    ).toMatchObject({ valid: true });
    expect(
      verifyOvieBoundedApproval(approval, {
        actor: 'other_actor',
        action: 'merge',
        repository: REPOSITORY,
      })
    ).toMatchObject({ valid: false, reason: 'actor-mismatch' });
    expect(
      verifyOvieBoundedApproval(approval, {
        actor: ACTOR,
        action: 'deploy',
        repository: REPOSITORY,
      })
    ).toMatchObject({ valid: false, reason: 'action-mismatch' });
    expect(
      verifyOvieBoundedApproval(approval, {
        actor: ACTOR,
        action: 'merge',
        repository: 'JovieInc/logyourbody',
      })
    ).toMatchObject({ valid: false, reason: 'repository-mismatch' });
    expect(
      verifyOvieBoundedApproval(approval, {
        actor: ACTOR,
        action: 'merge',
        repository: REPOSITORY,
        revision: 'b'.repeat(40),
      })
    ).toMatchObject({ valid: false, reason: 'revision-mismatch' });
    expect(
      verifyOvieBoundedApproval(approval, {
        actor: ACTOR,
        action: 'merge',
        repository: REPOSITORY,
        diffDigest: ovieApprovalDiffDigest('diff-bytes-v2'),
      })
    ).toMatchObject({ valid: false, reason: 'revision-mismatch' });
  });

  it('invalidates stale approvals after expiry and after revocation', async () => {
    const store = new MemoryOperatingStore();
    const expired = await record(store, {
      id: 'approval_expired',
      ttlMinutes: 1,
      now: new Date(Date.now() - 10 * 60_000),
    });
    expect(
      verifyOvieBoundedApproval(expired, {
        actor: ACTOR,
        action: 'merge',
        repository: REPOSITORY,
      })
    ).toMatchObject({ valid: false, reason: 'expired' });

    const live = await record(store, { id: 'approval_revoked' });
    const revoked = await revokeOvieBoundedApproval(store, 'approval_revoked');
    expect(revoked?.revokedAt).not.toBeNull();
    expect(
      verifyOvieBoundedApproval(live && revoked ? revoked : live, {
        actor: ACTOR,
        action: 'merge',
        repository: REPOSITORY,
      })
    ).toMatchObject({ valid: false, reason: 'revoked' });
    expect(
      verifyOvieBoundedApproval(
        await getOvieBoundedApproval(store, 'approval_revoked'),
        {
          actor: ACTOR,
          action: 'merge',
          repository: REPOSITORY,
        }
      )
    ).toMatchObject({ valid: false, reason: 'revoked' });
  });

  it('rejects unbounded or malformed approvals fail-closed', async () => {
    const store = new MemoryOperatingStore();
    expect(() => record(store, { ttlMinutes: 0 })).toThrow(OvieApprovalError);
    expect(() =>
      record(store, { ttlMinutes: OVIE_APPROVAL_MAX_TTL_MINUTES + 1 })
    ).toThrow(OvieApprovalError);
    expect(() => record(store, { ttlMinutes: 5.5 })).toThrow(OvieApprovalError);
    expect(() => record(store, { action: 'do-anything' })).toThrow(
      OvieApprovalError
    );
    expect(() => record(store, { actor: '  ' })).toThrow(OvieApprovalError);
    expect(() => record(store, { revision: '' })).toThrow(OvieApprovalError);
    expect(() => record(store, { diffDigest: 'md5:abc' })).toThrow(
      OvieApprovalError
    );
  });

  it('caps the approval lifetime at the documented bound', async () => {
    const store = new MemoryOperatingStore();
    const now = new Date('2026-09-26T00:00:00.000Z');
    const approval = await record(store, { now });
    expect((Date.parse(approval.expiresAt) - now.getTime()) / 60_000).toBe(
      OVIE_APPROVAL_MAX_TTL_MINUTES
    );
    expect(OVIE_APPROVAL_ACTIONS).toContain('merge');
  });

  it('returns unknown-approval for ids that were never recorded', async () => {
    const store = new MemoryOperatingStore();
    expect(await getOvieBoundedApproval(store, 'never_recorded')).toBeNull();
    expect(
      verifyOvieBoundedApproval(null, {
        actor: ACTOR,
        action: 'merge',
        repository: REPOSITORY,
      })
    ).toMatchObject({ valid: false, reason: 'unknown-approval' });
    expect(await revokeOvieBoundedApproval(store, 'never_recorded')).toBeNull();
  });
});
