import { describe, expect, it } from 'vitest';
import {
  APPROVAL_SCHEMA,
  ApprovalError,
  asApproval,
  checkApproval,
  consumeApproval,
  grantApproval,
  isApprovalAction,
  revokeApproval,
} from '@/lib/ovie/mcp/approvals';
import { memoryRecordBackend } from '@/lib/ovie/mcp/store';

const BASE = {
  actor: 'user_tim',
  action: 'publish-company-code',
  repository: 'JovieInc/Jovie',
  branch: 'hyperagent/jov-6557-20260926t142522',
  headSha: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
} as const;

const checkFor = (overrides: Partial<typeof BASE> = {}) => ({
  action: BASE.action,
  repository: BASE.repository,
  branch: BASE.branch,
  headSha: BASE.headSha,
  ...overrides,
});

describe('bounded agent approvals (JOV-6557)', () => {
  it('grants, checks and consumes an approval bound to the exact head', async () => {
    const backend = memoryRecordBackend();
    const granted = await grantApproval(backend, BASE);
    expect(granted.schema).toBe(APPROVAL_SCHEMA);
    expect(granted.consumedAt).toBeUndefined();

    const check = await checkApproval(backend, checkFor());
    expect(check.outcome).toBe('granted');

    const consumed = await consumeApproval(backend, checkFor());
    expect(consumed.outcome).toBe('granted');

    const second = await consumeApproval(backend, checkFor());
    expect(second.outcome).toBe('already-consumed');
  });

  it('checks read-only: an unconsumed approval survives any number of checks', async () => {
    const backend = memoryRecordBackend();
    await grantApproval(backend, BASE);
    for (let i = 0; i < 3; i += 1) {
      const check = await checkApproval(backend, checkFor());
      expect(check.outcome).toBe('granted');
    }
    const consumed = await consumeApproval(backend, checkFor());
    expect(consumed.outcome).toBe('granted');
  });

  it('invalidates a stale approval after the head moves (material change)', async () => {
    const backend = memoryRecordBackend();
    await grantApproval(backend, BASE);
    const stale = await checkApproval(
      backend,
      checkFor({ headSha: 'ffffffffffffffffffffffffffffffffffffffff' })
    );
    expect(stale.outcome).toBe('stale-head');

    // Re-granting at the new head supersedes: latest granted wins.
    const regranted = await grantApproval(backend, {
      ...BASE,
      headSha: 'ffffffffffffffffffffffffffffffffffffffff',
    });
    const check = await checkApproval(
      backend,
      checkFor({ headSha: regranted.headSha })
    );
    expect(check.outcome).toBe('granted');
  });

  it('rejects a mismatched actor (approval does not transfer between actors)', async () => {
    const backend = memoryRecordBackend();
    await grantApproval(backend, BASE);
    const other = await checkApproval(
      backend,
      checkFor({ actor: 'user_other' })
    );
    expect(other.outcome).toBe('actor-mismatch');
  });

  it('rejects a missing approval for an ungranted binding', async () => {
    const backend = memoryRecordBackend();
    const missing = await checkApproval(backend, checkFor());
    expect(missing.outcome).toBe('missing');
    const consumeMissing = await consumeApproval(backend, checkFor());
    expect(consumeMissing.outcome).toBe('missing');
  });

  it('expires an approval after its expiry timestamp', async () => {
    const backend = memoryRecordBackend();
    await grantApproval(backend, {
      ...BASE,
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    });
    const expired = await checkApproval(backend, checkFor(), Date.now() + 2000);
    expect(expired.outcome).toBe('expired');
    const consumeExpired = await consumeApproval(
      backend,
      checkFor(),
      undefined,
      Date.now() + 2000
    );
    expect(consumeExpired.outcome).toBe('expired');
  });

  it('revoking marks consumed so the approval never authorizes again', async () => {
    const backend = memoryRecordBackend();
    const granted = await grantApproval(backend, BASE);
    const revoked = await revokeApproval(backend, granted.id);
    expect(revoked?.consumedAt).toBeDefined();
    const after = await consumeApproval(backend, checkFor());
    expect(after.outcome).toBe('already-consumed');
  });

  it('consumption is single-shot under a concurrent CAS race', async () => {
    const backend = memoryRecordBackend();
    const granted = await grantApproval(backend, BASE);
    // Simulate a concurrent writer mutating the stored record between the
    // read and the compare-and-set: the CAS must lose and fail closed.
    await backend.set(`ovie:mcp:v1:approval:${granted.id}`, {
      ...granted,
      consumedAt: new Date().toISOString(),
    });
    const raced = await consumeApproval(backend, checkFor());
    expect(raced.outcome).toBe('already-consumed');
  });

  it('validates grant inputs and rejects malformed records on read', async () => {
    const backend = memoryRecordBackend();
    await expect(
      grantApproval(backend, { ...BASE, headSha: 'not-a-sha' })
    ).rejects.toThrow(ApprovalError);
    await expect(
      grantApproval(backend, { ...BASE, actor: '   ' })
    ).rejects.toThrow(ApprovalError);
    await expect(
      grantApproval(backend, { ...BASE, expiresAt: 'not-a-date' })
    ).rejects.toThrow(ApprovalError);

    expect(isApprovalAction('publish-company-code')).toBe(true);
    expect(isApprovalAction('delete-everything')).toBe(false);
    expect(asApproval({ schema: 'other', kind: 'approval' })).toBeUndefined();
    expect(asApproval(undefined)).toBeUndefined();
  });
});
