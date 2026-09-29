import { describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_TTL_MS,
  authorizeRiskyProfileAction,
  decideProfileApproval,
  getProfileTeamRole,
  listProfileApprovals,
  requestProfileApproval,
  revokeProfileApproval,
} from './approvals';

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: vi.fn().mockResolvedValue(undefined),
  captureError: vi.fn().mockResolvedValue(undefined),
}));

const OWNER = '00000000-0000-4000-8000-0000000000aa';
const MANAGER = '00000000-0000-4000-8000-0000000000bb';
const VIEWER = '00000000-0000-4000-8000-0000000000cc';
const OUTSIDER = '00000000-0000-4000-8000-0000000000dd';
const PROFILE = '00000000-0000-4000-8000-0000000000ee';
const APPROVAL_ID = '00000000-0000-4000-8000-0000000000ff';
const NEW_APPROVAL_ID = '00000000-0000-4000-8000-0000000000ab';

type Row = Record<string, unknown>;

/**
 * Fake transaction. `selectResults` are consumed in order — each
 * tx.select() pops the next row list. `where()` is thenable so both
 * `await tx.select()...where()` and `.limit(n)` work.
 */
function createTx(options: { selectResults: Row[][]; insertReturn?: Row[] }) {
  const selectResults = [...options.selectResults];
  const recorded = {
    updates: [] as { table: unknown; values: unknown }[],
    inserts: [] as { table: unknown; values: unknown }[],
  };

  const tx = {
    select: vi.fn(() => {
      const rows = selectResults.shift() ?? [];
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.limit = vi.fn((n: number) => Promise.resolve(rows.slice(0, n)));
      chain.then = (onFulfilled: (v: Row[]) => unknown, onRejected?: unknown) =>
        Promise.resolve(rows).then(onFulfilled, onRejected as never);
      return chain;
    }),
    update: vi.fn((table: unknown) => {
      const chain: Record<string, unknown> = {};
      chain.set = vi.fn((values: unknown) => {
        recorded.updates.push({ table, values });
        return chain;
      });
      chain.where = vi.fn(() => Promise.resolve(undefined));
      return chain;
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        recorded.inserts.push({ table, values });
        const result = options.insertReturn ?? [];
        const v: Record<string, unknown> = {
          returning: vi.fn(() => Promise.resolve(result)),
        };
        v.then = (onFulfilled: (v: unknown) => unknown, onRejected?: unknown) =>
          Promise.resolve(undefined).then(onFulfilled, onRejected as never);
        return v;
      }),
    })),
  };

  return { tx: tx as never, recorded };
}

const ownerClaims = [{ userId: OWNER, role: 'owner' }];
const managerClaims = [{ userId: MANAGER, role: 'manager' }];
const viewerClaims = [{ userId: VIEWER, role: 'viewer' }];
const ownerProfile = [{ userId: OWNER }];

describe('getProfileTeamRole', () => {
  it('returns null role for non-uuid input without touching the db', async () => {
    const { tx } = createTx({ selectResults: [] });
    const result = await getProfileTeamRole(tx, 'not-a-uuid', 'also-bad');
    expect(result.role).toBeNull();
  });

  it('returns null role when the profile does not exist', async () => {
    const { tx } = createTx({ selectResults: [[], []] });
    const result = await getProfileTeamRole(tx, PROFILE, OWNER);
    expect(result.role).toBeNull();
  });

  it('resolves the role from claims when claims exist', async () => {
    const { tx } = createTx({ selectResults: [managerClaims, ownerProfile] });
    const result = await getProfileTeamRole(tx, PROFILE, MANAGER);
    expect(result.role).toBe('manager');
  });

  it('falls back to legacy owner only when there are no claims', async () => {
    const { tx } = createTx({ selectResults: [[], ownerProfile] });
    const result = await getProfileTeamRole(tx, PROFILE, OWNER);
    expect(result.role).toBe('owner');
  });

  it('returns null when claims exist but none belong to the user', async () => {
    const { tx } = createTx({ selectResults: [ownerClaims, ownerProfile] });
    const result = await getProfileTeamRole(tx, PROFILE, OUTSIDER);
    expect(result.role).toBeNull();
  });
});

describe('authorizeRiskyProfileAction', () => {
  it('allows owners directly without consuming approvals', async () => {
    const { tx, recorded } = createTx({
      selectResults: [ownerClaims, ownerProfile],
    });
    const result = await authorizeRiskyProfileAction(tx, {
      appUserId: OWNER,
      profileId: PROFILE,
      action: 'links.mutate',
    });
    expect(result).toEqual({ status: 'allowed', role: 'owner' });
    expect(recorded.updates).toHaveLength(0);
  });

  it('denies viewers outright', async () => {
    const { tx } = createTx({ selectResults: [viewerClaims, ownerProfile] });
    const result = await authorizeRiskyProfileAction(tx, {
      appUserId: VIEWER,
      profileId: PROFILE,
      action: 'links.mutate',
    });
    expect(result.status).toBe('denied');
  });

  it('denies owner-only actions even for managers', async () => {
    const { tx } = createTx({ selectResults: [managerClaims, ownerProfile] });
    const result = await authorizeRiskyProfileAction(tx, {
      appUserId: MANAGER,
      profileId: PROFILE,
      action: 'handle.change',
    });
    expect(result.status).toBe('denied');
  });

  it('requires approval for managers without an approved grant', async () => {
    const { tx } = createTx({
      selectResults: [managerClaims, ownerProfile, [], []],
    });
    const result = await authorizeRiskyProfileAction(tx, {
      appUserId: MANAGER,
      profileId: PROFILE,
      action: 'links.mutate',
    });
    expect(result).toEqual({ status: 'requires_approval', role: 'manager' });
  });

  it('consumes a valid approval and records the event', async () => {
    const { tx, recorded } = createTx({
      selectResults: [managerClaims, ownerProfile, [], [{ id: APPROVAL_ID }]],
    });
    const result = await authorizeRiskyProfileAction(tx, {
      appUserId: MANAGER,
      profileId: PROFILE,
      action: 'links.mutate',
    });
    expect(result).toEqual({
      status: 'allowed',
      role: 'manager',
      approvalId: APPROVAL_ID,
    });
    expect(recorded.updates).toHaveLength(1);
    expect((recorded.updates[0].values as Row).consumedAt).toBeInstanceOf(Date);
    expect(recorded.inserts).toHaveLength(1);
    expect((recorded.inserts[0].values as Row).event).toBe('consumed');
  });

  it('expires stale approvals before checking for a grant', async () => {
    const { tx, recorded } = createTx({
      selectResults: [
        managerClaims,
        ownerProfile,
        [{ id: 'stale-1' }, { id: 'stale-2' }],
        [],
      ],
    });
    const result = await authorizeRiskyProfileAction(tx, {
      appUserId: MANAGER,
      profileId: PROFILE,
      action: 'links.mutate',
    });
    expect(result.status).toBe('requires_approval');
    expect(recorded.updates[0].values).toMatchObject({ status: 'expired' });
    expect(recorded.inserts).toHaveLength(1);
    expect(recorded.inserts[0].values).toHaveLength(2);
  });
});

describe('requestProfileApproval', () => {
  it('rejects invalid ids', async () => {
    const { tx } = createTx({ selectResults: [] });
    const result = await requestProfileApproval(tx, {
      appUserId: 'nope',
      profileId: PROFILE,
      action: 'links.mutate',
    });
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('returns forbidden when the user has no role', async () => {
    const { tx } = createTx({ selectResults: [[], ownerProfile] });
    const result = await requestProfileApproval(tx, {
      appUserId: OUTSIDER,
      profileId: PROFILE,
      action: 'links.mutate',
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns forbidden for viewers who cannot request', async () => {
    const { tx } = createTx({ selectResults: [viewerClaims, ownerProfile] });
    const result = await requestProfileApproval(tx, {
      appUserId: VIEWER,
      profileId: PROFILE,
      action: 'links.mutate',
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns not_needed for owners who act directly', async () => {
    const { tx } = createTx({ selectResults: [ownerClaims, ownerProfile] });
    const result = await requestProfileApproval(tx, {
      appUserId: OWNER,
      profileId: PROFILE,
      action: 'links.mutate',
    });
    expect(result).toEqual({ ok: false, reason: 'not_needed' });
  });

  it('returns the existing pending request instead of duplicating', async () => {
    const { tx, recorded } = createTx({
      selectResults: [managerClaims, ownerProfile, [{ id: APPROVAL_ID }]],
    });
    const result = await requestProfileApproval(tx, {
      appUserId: MANAGER,
      profileId: PROFILE,
      action: 'links.mutate',
    });
    expect(result).toEqual({
      ok: true,
      approvalId: APPROVAL_ID,
      alreadyPending: true,
    });
    expect(recorded.inserts).toHaveLength(0);
  });

  it('creates a pending approval with an expiry and audit event', async () => {
    const { tx, recorded } = createTx({
      selectResults: [managerClaims, ownerProfile, []],
      insertReturn: [{ id: NEW_APPROVAL_ID }],
    });
    const result = await requestProfileApproval(tx, {
      appUserId: MANAGER,
      profileId: PROFILE,
      action: 'links.mutate',
      reason: 'swap homepage link',
      payload: { url: 'https://example.com' },
    });
    expect(result).toEqual({
      ok: true,
      approvalId: NEW_APPROVAL_ID,
      alreadyPending: false,
    });
    const inserted = recorded.inserts[0].values as Row;
    expect(inserted.creatorProfileId).toBe(PROFILE);
    expect(inserted.action).toBe('links.mutate');
    expect(inserted.reason).toBe('swap homepage link');
    expect((inserted.expiresAt as Date).getTime() - Date.now()).toBeGreaterThan(
      APPROVAL_TTL_MS - 60_000
    );
    expect((recorded.inserts[1].values as Row).event).toBe('requested');
  });
});

const pendingApproval = {
  id: APPROVAL_ID,
  creatorProfileId: PROFILE,
  action: 'links.mutate',
  status: 'pending',
  requestedBy: MANAGER,
  expiresAt: new Date(Date.now() + 60_000),
  reason: null,
};

describe('decideProfileApproval', () => {
  it('rejects invalid ids', async () => {
    const { tx } = createTx({ selectResults: [] });
    const result = await decideProfileApproval(tx, {
      approvalId: 'bad',
      actorUserId: OWNER,
      decision: 'approved',
    });
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('returns not_found when the approval does not exist', async () => {
    const { tx } = createTx({ selectResults: [[]] });
    const result = await decideProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: OWNER,
      decision: 'approved',
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('forbids non-owner decisions', async () => {
    const { tx } = createTx({
      selectResults: [[pendingApproval], managerClaims, ownerProfile],
    });
    const result = await decideProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: MANAGER,
      decision: 'approved',
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('rejects a non-pending approval', async () => {
    const { tx } = createTx({
      selectResults: [
        [{ ...pendingApproval, status: 'rejected' }],
        ownerClaims,
        ownerProfile,
        [],
      ],
    });
    const result = await decideProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: OWNER,
      decision: 'approved',
    });
    expect(result).toEqual({ ok: false, reason: 'not_pending' });
  });

  it('rejects an expired pending approval', async () => {
    const { tx } = createTx({
      selectResults: [
        [{ ...pendingApproval, expiresAt: new Date(Date.now() - 1000) }],
        ownerClaims,
        ownerProfile,
        [],
      ],
    });
    const result = await decideProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: OWNER,
      decision: 'approved',
    });
    expect(result).toEqual({ ok: false, reason: 'not_pending' });
  });

  it('approves a pending request and writes the audit event', async () => {
    const { tx, recorded } = createTx({
      selectResults: [[pendingApproval], ownerClaims, ownerProfile, []],
    });
    const result = await decideProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: OWNER,
      decision: 'approved',
      reason: 'looks good',
    });
    expect(result).toEqual({ ok: true });
    expect(recorded.updates[0].values).toMatchObject({
      status: 'approved',
      decidedBy: OWNER,
      reason: 'looks good',
    });
    expect((recorded.inserts[0].values as Row).event).toBe('approved');
  });

  it('rejects a pending request keeping the original reason', async () => {
    const { tx, recorded } = createTx({
      selectResults: [
        [{ ...pendingApproval, reason: 'please' }],
        ownerClaims,
        ownerProfile,
        [],
      ],
    });
    const result = await decideProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: OWNER,
      decision: 'rejected',
    });
    expect(result).toEqual({ ok: true });
    expect(recorded.updates[0].values).toMatchObject({
      status: 'rejected',
      reason: 'please',
    });
  });
});

describe('revokeProfileApproval', () => {
  it('lets the requester withdraw their own request', async () => {
    const { tx, recorded } = createTx({
      selectResults: [[pendingApproval], managerClaims, ownerProfile],
    });
    const result = await revokeProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: MANAGER,
    });
    expect(result).toEqual({ ok: true });
    expect(recorded.updates[0].values).toMatchObject({ status: 'revoked' });
    expect((recorded.inserts[0].values as Row).event).toBe('revoked');
  });

  it('lets the owner revoke an approved grant', async () => {
    const { tx } = createTx({
      selectResults: [
        [{ ...pendingApproval, status: 'approved' }],
        ownerClaims,
        ownerProfile,
      ],
    });
    const result = await revokeProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: OWNER,
    });
    expect(result).toEqual({ ok: true });
  });

  it('forbids a third party from revoking', async () => {
    const { tx } = createTx({
      selectResults: [
        [pendingApproval],
        [{ userId: OUTSIDER, role: 'assistant' }],
        ownerProfile,
      ],
    });
    const result = await revokeProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: OUTSIDER,
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('rejects revoking a terminal approval', async () => {
    const { tx } = createTx({
      selectResults: [
        [{ ...pendingApproval, status: 'rejected' }],
        ownerClaims,
        ownerProfile,
      ],
    });
    const result = await revokeProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: OWNER,
    });
    expect(result).toEqual({ ok: false, reason: 'not_pending' });
  });

  it('returns not_found for a missing approval', async () => {
    const { tx } = createTx({ selectResults: [[]] });
    const result = await revokeProfileApproval(tx, {
      approvalId: APPROVAL_ID,
      actorUserId: OWNER,
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('listProfileApprovals', () => {
  it('rejects invalid ids', async () => {
    const { tx } = createTx({ selectResults: [] });
    const result = await listProfileApprovals(tx, {
      profileId: 'bad',
      appUserId: OWNER,
    });
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('returns forbidden when the user has no role', async () => {
    const { tx } = createTx({ selectResults: [[], [], ownerProfile] });
    const result = await listProfileApprovals(tx, {
      profileId: PROFILE,
      appUserId: OUTSIDER,
    });
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('returns the approval queue for team members', async () => {
    const { tx } = createTx({
      selectResults: [[], managerClaims, ownerProfile, [pendingApproval]],
    });
    const result = await listProfileApprovals(tx, {
      profileId: PROFILE,
      appUserId: MANAGER,
    });
    expect(result).toEqual({ ok: true, approvals: [pendingApproval] });
  });

  it('expires stale approvals before listing', async () => {
    const { tx, recorded } = createTx({
      selectResults: [[{ id: 'stale-1' }], managerClaims, ownerProfile, []],
    });
    const result = await listProfileApprovals(tx, {
      profileId: PROFILE,
      appUserId: MANAGER,
    });
    expect(result.ok).toBe(true);
    expect(recorded.updates[0].values).toMatchObject({ status: 'expired' });
  });
});
