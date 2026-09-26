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
    // Same live bound: the stored record is returned so the caller's token
    // is the one that validates.
    expect(second.actor).toBe(first.actor);
    expect(second.grantedAt).toBe(first.grantedAt);
    expect(second.expiresAt).toBe(first.expiresAt);
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
});
