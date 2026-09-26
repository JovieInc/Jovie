import { describe, expect, it } from 'vitest';
import {
  approvalTokenMatches,
  assertOvieApproval,
  grantOvieApproval,
  memoryApprovalBackend,
  type OvieApprovalAction,
  OvieApprovalError,
  revokeOvieApproval,
} from '@/lib/ovie/approvals';

const actor = 'summer';
const action: OvieApprovalAction = 'merge';
const repository = 'JovieInc/Jovie';
const revision = 'a'.repeat(40);

function grant(backend = memoryApprovalBackend()) {
  return grantOvieApproval(backend, { actor, action, repository, revision });
}

describe('bounded Ovie approvals (JOV-6557)', () => {
  it('grants a bounded approval and validates it for the bound request', async () => {
    const backend = memoryApprovalBackend();
    const approval = await grant(backend);
    expect(approval.id).toMatch(/^app_[A-Za-z0-9_-]{24}$/);
    expect(approval.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const validated = await assertOvieApproval(backend, {
      actor,
      action,
      repository,
      revision,
      approvalId: approval.id,
      token: approval.token,
    });
    expect(validated.actor).toBe(actor);
    expect(validated.action).toBe('merge');
    expect(validated.repository).toBe(repository);
    expect(validated.revision).toBe(revision);
  });

  it('is deterministic per (actor, action, repository, revision) bound', async () => {
    const backend = memoryApprovalBackend();
    const first = await grant(backend);
    const second = await grant(backend);
    expect(second.id).toBe(first.id);
    // Same live bound: the re-grant rotates the token, so a later caller
    // holds a fresh token that validates and the earlier grant's token
    // no longer does.
    expect(second.token).not.toBe(first.token);
    expect(second.actor).toBe(first.actor);
    expect(second.expiresAt).toBe(first.expiresAt);
    const secondValidated = await assertOvieApproval(backend, {
      actor,
      action,
      repository,
      revision,
      approvalId: second.id,
      token: second.token,
    });
    expect(secondValidated.id).toBe(second.id);
    await expect(
      assertOvieApproval(backend, {
        actor,
        action,
        repository,
        revision,
        approvalId: first.id,
        token: first.token,
      })
    ).rejects.toThrow(/token/i);
  });

  it('fails closed on an unknown approval', async () => {
    const backend = memoryApprovalBackend();
    await expect(
      assertOvieApproval(backend, {
        actor,
        action,
        repository,
        revision,
        approvalId: 'app_missing',
        token: 'token',
      })
    ).rejects.toThrow(OvieApprovalError);
    await expect(
      assertOvieApproval(backend, {
        actor,
        action,
        repository,
        revision,
        approvalId: 'app_missing',
        token: 'token',
      })
    ).rejects.toThrow(/not found/i);
  });

  it('invalidates on a material revision change', async () => {
    const backend = memoryApprovalBackend();
    const approval = await grant(backend);
    await expect(
      assertOvieApproval(backend, {
        actor,
        action,
        repository,
        revision: 'b'.repeat(40),
        approvalId: approval.id,
        token: approval.token,
      })
    ).rejects.toThrow(/material change/i);
  });

  it('invalidates on actor, action and repository mismatch', async () => {
    const backend = memoryApprovalBackend();
    const approval = await grant(backend);
    for (const override of [
      { actor: 'symphony' },
      { action: 'deploy' as OvieApprovalAction },
      { repository: 'JovieInc/logyourbody' },
    ]) {
      await expect(
        assertOvieApproval(backend, {
          actor,
          action,
          repository,
          revision,
          approvalId: approval.id,
          token: approval.token,
          ...override,
        })
      ).rejects.toThrow(OvieApprovalError);
    }
  });

  it('invalidates after the expiry bound', async () => {
    const backend = memoryApprovalBackend();
    const approval = await grantOvieApproval(backend, {
      actor,
      action,
      repository,
      revision,
      ttlSeconds: 60,
    });
    await expect(
      assertOvieApproval(backend, {
        actor,
        action,
        repository,
        revision,
        approvalId: approval.id,
        token: approval.token,
        at: new Date(Date.parse(approval.expiresAt) + 1000).toISOString(),
      })
    ).rejects.toThrow(/expired/i);
    await expect(
      assertOvieApproval(backend, {
        actor,
        action,
        repository,
        revision,
        approvalId: approval.id,
        token: approval.token,
      })
    ).resolves.toMatchObject({ actor });
  });

  it('revocation prevents further use of a live approval', async () => {
    const backend = memoryApprovalBackend();
    const approval = await grant(backend);
    expect(await revokeOvieApproval(backend, approval.id)).toBe(true);
    await expect(
      assertOvieApproval(backend, {
        actor,
        action,
        repository,
        revision,
        approvalId: approval.id,
        token: approval.token,
      })
    ).rejects.toThrow(/not found/i);
  });

  it('compares tokens with timing-safe equality', () => {
    const token = 'tok_fixed_token_fixed_token_fixed';
    expect(approvalTokenMatches(token, token)).toBe(true);
    expect(approvalTokenMatches(token, token.slice(0, -1) + 'x')).toBe(false);
    expect(approvalTokenMatches(token, 'short')).toBe(false);
  });

  it('rejects a forged token on an otherwise-valid bound (JOV-6557 token exposure negative test)', async () => {
    const backend = memoryApprovalBackend();
    const approval = await grant(backend);
    // The approval id is deterministic from non-secret bound fields, so a
    // caller that never held the token must still fail closed.
    await expect(
      assertOvieApproval(backend, {
        actor,
        action,
        repository,
        revision,
        approvalId: approval.id,
        token: 'forged-token-value-1234567890',
      })
    ).rejects.toThrow(OvieApprovalError);
    await expect(
      assertOvieApproval(backend, {
        actor,
        action,
        repository,
        revision,
        approvalId: approval.id,
        token: 'forged-token-value-1234567890',
      })
    ).rejects.toThrow(/token/i);
    await expect(
      assertOvieApproval(backend, {
        actor,
        action,
        repository,
        revision,
        approvalId: approval.id,
        token: '',
      })
    ).rejects.toThrow(/token/i);
  });

  it('never persists a replayable raw token: the stored record carries only a digest', async () => {
    const records = new Map<string, unknown>();
    const backend = memoryApprovalBackend({ records });
    const approval = await grant(backend);
    const stored = records.get(`ovie:approval:v1:${approval.id}`) as Record<
      string,
      unknown
    >;
    expect(stored).toBeDefined();
    expect(stored.token).toBeUndefined();
    expect(typeof stored.tokenDigest).toBe('string');
    expect(String(stored.tokenDigest)).not.toContain(approval.token);
  });
});
