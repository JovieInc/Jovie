import { describe, expect, it } from 'vitest';
import {
  BOUNDED_APPROVAL_ACTIONS,
  BOUNDED_APPROVAL_MAX_TTL_MS,
  BoundedApprovalError,
  buildBoundedApproval,
  checkBoundedApproval,
  evaluateBoundedApproval,
  grantBoundedApproval,
  revokeBoundedApproval,
} from '@/lib/ovie/approvals';
import {
  MemoryOperatingStore,
  memoryRecordBackend,
  type OperatingStore,
} from '@/lib/ovie/mcp/store';

const ACTOR = 'user_founder';
const REPO = 'JovieInc/Jovie';
const REVISION = '4e80954f1b2de934694ce0039fc5c60ad6ad5e73';
const OTHER_REVISION = '0000000000000000000000000000000000000001';
const GRANTED_AT = '2026-09-26T09:15:00.000Z';
const TTL_MS = 10 * 60 * 1000;

function makeStore(): {
  store: OperatingStore;
  bags: ReturnType<typeof memoryRecordBackend>;
} {
  const bags = memoryRecordBackend();
  return { store: new MemoryOperatingStore(bags), bags };
}

describe('buildBoundedApproval', () => {
  it('builds an approval bound to actor, action, repository, revision, and expiry', () => {
    const approval = buildBoundedApproval({
      action: 'publish-company-code',
      actor: ACTOR,
      repository: REPO,
      revision: REVISION,
      grantedAt: GRANTED_AT,
      ttlMs: TTL_MS,
    });
    expect(approval.action).toBe('publish-company-code');
    expect(approval.actor).toBe(ACTOR);
    expect(approval.repository).toBe(REPO);
    expect(approval.revision).toBe(REVISION);
    expect(approval.expiresAt).toBe('2026-09-26T09:25:00.000Z');
  });

  it('rejects actions outside the bounded set', () => {
    expect(() =>
      buildBoundedApproval({
        action: 'delete-everything' as never,
        actor: ACTOR,
        repository: REPO,
        revision: REVISION,
        grantedAt: GRANTED_AT,
        ttlMs: TTL_MS,
      })
    ).toThrow(BoundedApprovalError);
  });

  it('rejects revisions that are not exact commit shas', () => {
    expect(() =>
      buildBoundedApproval({
        action: 'merge-pr',
        actor: ACTOR,
        repository: REPO,
        revision: 'main',
        grantedAt: GRANTED_AT,
        ttlMs: TTL_MS,
      })
    ).toThrow(BoundedApprovalError);
  });

  it('rejects ttl above the bounded maximum', () => {
    expect(() =>
      buildBoundedApproval({
        action: 'merge-pr',
        actor: ACTOR,
        repository: REPO,
        revision: REVISION,
        grantedAt: GRANTED_AT,
        ttlMs: BOUNDED_APPROVAL_MAX_TTL_MS + 1,
      })
    ).toThrow(BoundedApprovalError);
  });

  it('rejects missing actor or repository bounds', () => {
    expect(() =>
      buildBoundedApproval({
        action: 'merge-pr',
        actor: '  ',
        repository: REPO,
        revision: REVISION,
        grantedAt: GRANTED_AT,
        ttlMs: TTL_MS,
      })
    ).toThrow(BoundedApprovalError);
  });
});

describe('evaluateBoundedApproval', () => {
  const base = buildBoundedApproval({
    action: 'publish-company-code',
    actor: ACTOR,
    repository: REPO,
    revision: REVISION,
    grantedAt: GRANTED_AT,
    ttlMs: TTL_MS,
  });

  it('returns valid inside the expiry window with no material change', () => {
    const decision = evaluateBoundedApproval(
      base,
      {
        action: 'publish-company-code',
        actor: ACTOR,
        repository: REPO,
        revision: REVISION,
      },
      Date.parse(GRANTED_AT) + 1000
    );
    expect(decision.status).toBe('valid');
    expect(decision.reason).toBeNull();
  });

  it('invalidates a material actor change', () => {
    const decision = evaluateBoundedApproval(
      base,
      {
        action: 'publish-company-code',
        actor: 'user_someone_else',
        repository: REPO,
        revision: REVISION,
      },
      Date.parse(GRANTED_AT) + 1000
    );
    expect(decision.status).toBe('material-change');
    expect(decision.reason).toContain('actor changed');
  });

  it('invalidates a material revision change', () => {
    const decision = evaluateBoundedApproval(
      base,
      {
        action: 'publish-company-code',
        actor: ACTOR,
        repository: REPO,
        revision: OTHER_REVISION,
      },
      Date.parse(GRANTED_AT) + 1000
    );
    expect(decision.status).toBe('material-change');
    expect(decision.reason).toContain('revision changed');
  });

  it('invalidates a material repository change', () => {
    const decision = evaluateBoundedApproval(
      base,
      {
        action: 'publish-company-code',
        actor: ACTOR,
        repository: 'JovieInc/logyourbody',
        revision: REVISION,
      },
      Date.parse(GRANTED_AT) + 1000
    );
    expect(decision.status).toBe('material-change');
    expect(decision.reason).toContain('repository changed');
  });

  it('reports expiry after the expiry window', () => {
    const decision = evaluateBoundedApproval(
      base,
      {
        action: 'publish-company-code',
        actor: ACTOR,
        repository: REPO,
        revision: REVISION,
      },
      Date.parse(base.expiresAt) + 1
    );
    expect(decision.status).toBe('expired');
  });

  it('reports unknown when no approval exists', () => {
    const decision = evaluateBoundedApproval(
      null,
      {
        action: 'publish-company-code',
        actor: ACTOR,
        repository: REPO,
        revision: REVISION,
      },
      Date.parse(GRANTED_AT)
    );
    expect(decision.status).toBe('unknown-approval');
  });
});

describe('bounded approval store round-trip', () => {
  it('persists a grant and validates it through the store', async () => {
    const { store } = makeStore();
    await grantBoundedApproval(store, {
      action: 'publish-company-code',
      actor: ACTOR,
      repository: REPO,
      revision: REVISION,
      grantedAt: GRANTED_AT,
      ttlMs: TTL_MS,
    });
    const decision = await checkBoundedApproval(
      store,
      {
        action: 'publish-company-code',
        actor: ACTOR,
        repository: REPO,
        revision: REVISION,
      },
      Date.parse(GRANTED_AT) + 1000
    );
    expect(decision.status).toBe('valid');
  });

  it('survives a store restart over the same durable backend', async () => {
    const { store, bags } = makeStore();
    await grantBoundedApproval(store, {
      action: 'publish-company-code',
      actor: ACTOR,
      repository: REPO,
      revision: REVISION,
      grantedAt: GRANTED_AT,
      ttlMs: TTL_MS,
    });
    const restarted = new MemoryOperatingStore(bags);
    const decision = await checkBoundedApproval(
      restarted,
      {
        action: 'publish-company-code',
        actor: ACTOR,
        repository: REPO,
        revision: REVISION,
      },
      Date.parse(GRANTED_AT) + 1000
    );
    expect(decision.status).toBe('valid');
  });

  it('reports unknown-approval for a check with no stored grant', async () => {
    const { store } = makeStore();
    const decision = await checkBoundedApproval(
      store,
      {
        action: 'deploy-production',
        actor: ACTOR,
        repository: REPO,
        revision: REVISION,
      },
      Date.parse(GRANTED_AT)
    );
    expect(decision.status).toBe('unknown-approval');
  });

  it('invalidates a material change through the store path', async () => {
    const { store } = makeStore();
    await grantBoundedApproval(store, {
      action: 'publish-company-code',
      actor: ACTOR,
      repository: REPO,
      revision: REVISION,
      grantedAt: GRANTED_AT,
      ttlMs: TTL_MS,
    });
    const decision = await checkBoundedApproval(
      store,
      {
        action: 'publish-company-code',
        actor: ACTOR,
        repository: REPO,
        revision: OTHER_REVISION,
      },
      Date.parse(GRANTED_AT) + 1000
    );
    expect(decision.status).toBe('material-change');
    expect(decision.reason).toContain('revision changed');
  });

  it('revokes an approval and rejects later checks', async () => {
    const { store } = makeStore();
    await grantBoundedApproval(store, {
      action: 'merge-pr',
      actor: ACTOR,
      repository: REPO,
      revision: REVISION,
      grantedAt: GRANTED_AT,
      ttlMs: TTL_MS,
    });
    const revoked = await revokeBoundedApproval(
      store,
      {
        action: 'merge-pr',
        actor: ACTOR,
        repository: REPO,
      },
      Date.parse(GRANTED_AT) + 2000
    );
    expect(revoked?.revocation).toBeTruthy();
    const decision = await checkBoundedApproval(
      store,
      {
        action: 'merge-pr',
        actor: ACTOR,
        repository: REPO,
        revision: REVISION,
      },
      Date.parse(GRANTED_AT) + 3000
    );
    expect(decision.status).toBe('revoked');
  });

  it('exports the bounded action set for consumers', () => {
    expect(BOUNDED_APPROVAL_ACTIONS).toContain('publish-company-code');
    expect(BOUNDED_APPROVAL_ACTIONS).toContain('merge-pr');
    expect(BOUNDED_APPROVAL_ACTIONS).toContain('deploy-production');
  });
});
