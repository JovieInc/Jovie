import { describe, expect, it, vi } from 'vitest';
import {
  authorizeRiskyProfileAction,
  decideProfileApproval,
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

type Row = Record<string, unknown>;

/** Fake tx: each select() pops the next row list; where() is thenable. */
function createTx(selects: Row[][], insertReturn: Row[] = []) {
  const queue = [...selects];
  const updates: Row[] = [];
  const inserts: unknown[] = [];
  const tx = {
    select: vi.fn(() => {
      const rows = queue.shift() ?? [];
      const chain: Row = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.limit = vi.fn((n: number) => Promise.resolve(rows.slice(0, n)));
      chain.then = (f: (v: Row[]) => unknown) => Promise.resolve(rows).then(f);
      return chain;
    }),
    update: vi.fn(() => {
      const chain: Row = {};
      chain.set = vi.fn((v: Row) => {
        updates.push(v);
        return chain;
      });
      chain.where = vi.fn(() => Promise.resolve());
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn((v: unknown) => {
        inserts.push(v);
        return {
          returning: vi.fn(() => Promise.resolve(insertReturn)),
          then: (f: () => unknown) => Promise.resolve().then(f),
        };
      }),
    })),
  };
  return { tx: tx as never, updates, inserts };
}

const ownerClaims = [{ userId: OWNER, role: 'owner' }];
const managerClaims = [{ userId: MANAGER, role: 'manager' }];
const viewerClaims = [{ userId: VIEWER, role: 'viewer' }];
const ownerProfile = [{ userId: OWNER }];
const pending = {
  id: APPROVAL_ID,
  creatorProfileId: PROFILE,
  action: 'links.mutate',
  status: 'pending',
  requestedBy: MANAGER,
  expiresAt: new Date(Date.now() + 60_000),
  reason: null,
};
const mutate = { profileId: PROFILE, action: 'links.mutate' as const };

describe('authorizeRiskyProfileAction', () => {
  it('allows owners directly and denies lower-privilege roles', async () => {
    const own = createTx([ownerClaims, ownerProfile]);
    const r = await authorizeRiskyProfileAction(own.tx, {
      ...mutate,
      appUserId: OWNER,
    });
    expect(r).toEqual({ status: 'allowed', role: 'owner' });
    expect(own.updates).toHaveLength(0);

    const viewer = createTx([viewerClaims, ownerProfile]);
    const vr = await authorizeRiskyProfileAction(viewer.tx, {
      ...mutate,
      appUserId: VIEWER,
    });
    expect(vr.status).toBe('denied');
  });

  it('requires approval without a grant and consumes a valid one', async () => {
    const noGrant = createTx([managerClaims, ownerProfile, [], []]);
    const r1 = await authorizeRiskyProfileAction(noGrant.tx, {
      ...mutate,
      appUserId: MANAGER,
    });
    expect(r1).toEqual({ status: 'requires_approval', role: 'manager' });

    const granted = createTx([
      managerClaims,
      ownerProfile,
      [],
      [{ id: APPROVAL_ID }],
    ]);
    const r2 = await authorizeRiskyProfileAction(granted.tx, {
      ...mutate,
      appUserId: MANAGER,
    });
    expect(r2).toEqual({
      status: 'allowed',
      role: 'manager',
      approvalId: APPROVAL_ID,
    });
    expect(granted.updates[0].consumedAt).toBeInstanceOf(Date);
    expect((granted.inserts[0] as Row).event).toBe('consumed');
  });
});

describe('requestProfileApproval', () => {
  it('rejects invalid, role-less, viewer, and owner callers', async () => {
    expect(
      await requestProfileApproval(createTx([]).tx, {
        ...mutate,
        appUserId: 'x',
      })
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(
      await requestProfileApproval(createTx([[], ownerProfile]).tx, {
        ...mutate,
        appUserId: OUTSIDER,
      })
    ).toEqual({ ok: false, reason: 'forbidden' });
    expect(
      await requestProfileApproval(createTx([viewerClaims, ownerProfile]).tx, {
        ...mutate,
        appUserId: VIEWER,
      })
    ).toEqual({ ok: false, reason: 'forbidden' });
    expect(
      await requestProfileApproval(createTx([ownerClaims, ownerProfile]).tx, {
        ...mutate,
        appUserId: OWNER,
      })
    ).toEqual({ ok: false, reason: 'not_needed' });
  });

  it('dedupes pending requests and creates new ones with audit', async () => {
    const dup = createTx([managerClaims, ownerProfile, [{ id: APPROVAL_ID }]]);
    expect(
      await requestProfileApproval(dup.tx, { ...mutate, appUserId: MANAGER })
    ).toEqual({ ok: true, approvalId: APPROVAL_ID, alreadyPending: true });
    expect(dup.inserts).toHaveLength(0);

    const fresh = createTx(
      [managerClaims, ownerProfile, []],
      [{ id: APPROVAL_ID }]
    );
    const r = await requestProfileApproval(fresh.tx, {
      ...mutate,
      appUserId: MANAGER,
      reason: 'swap link',
    });
    expect(r).toEqual({
      ok: true,
      approvalId: APPROVAL_ID,
      alreadyPending: false,
    });
    expect((fresh.inserts[0] as Row).reason).toBe('swap link');
    expect((fresh.inserts[1] as Row).event).toBe('requested');
  });
});

describe('decideProfileApproval', () => {
  const decide = { approvalId: APPROVAL_ID, actorUserId: OWNER };

  it('rejects invalid, missing, non-owner, and non-pending cases', async () => {
    expect(
      await decideProfileApproval(createTx([]).tx, {
        ...decide,
        approvalId: 'x',
        decision: 'approved',
      })
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(
      await decideProfileApproval(createTx([[]]).tx, {
        ...decide,
        decision: 'approved',
      })
    ).toEqual({ ok: false, reason: 'not_found' });
    expect(
      await decideProfileApproval(
        createTx([[pending], managerClaims, ownerProfile]).tx,
        { ...decide, actorUserId: MANAGER, decision: 'approved' }
      )
    ).toEqual({ ok: false, reason: 'forbidden' });

    const rejected = { ...pending, status: 'rejected' };
    expect(
      await decideProfileApproval(
        createTx([[rejected], ownerClaims, ownerProfile, []]).tx,
        { ...decide, decision: 'approved' }
      )
    ).toEqual({ ok: false, reason: 'not_pending' });

    const expired = { ...pending, expiresAt: new Date(Date.now() - 1000) };
    expect(
      await decideProfileApproval(
        createTx([[expired], ownerClaims, ownerProfile, []]).tx,
        { ...decide, decision: 'approved' }
      )
    ).toEqual({ ok: false, reason: 'not_pending' });
  });

  it('records approved and rejected decisions', async () => {
    const ok = createTx([[pending], ownerClaims, ownerProfile, []]);
    expect(
      await decideProfileApproval(ok.tx, {
        ...decide,
        decision: 'approved',
        reason: 'fine',
      })
    ).toEqual({ ok: true });
    expect(ok.updates[0]).toMatchObject({
      status: 'approved',
      decidedBy: OWNER,
      reason: 'fine',
    });
    expect((ok.inserts[0] as Row).event).toBe('approved');
  });
});

describe('revokeProfileApproval', () => {
  const revoke = { approvalId: APPROVAL_ID };

  it('lets the requester withdraw and the owner revoke a grant', async () => {
    const byRequester = createTx([[pending], managerClaims, ownerProfile]);
    expect(
      await revokeProfileApproval(byRequester.tx, {
        ...revoke,
        actorUserId: MANAGER,
      })
    ).toEqual({ ok: true });
    expect(byRequester.updates[0]).toMatchObject({ status: 'revoked' });
    expect((byRequester.inserts[0] as Row).event).toBe('revoked');

    const grant = { ...pending, status: 'approved' };
    const byOwner = createTx([[grant], ownerClaims, ownerProfile]);
    expect(
      await revokeProfileApproval(byOwner.tx, {
        ...revoke,
        actorUserId: OWNER,
      })
    ).toEqual({ ok: true });
  });

  it('rejects third parties, terminal approvals, and missing rows', async () => {
    const outsiderClaims = [{ userId: OUTSIDER, role: 'assistant' }];
    expect(
      await revokeProfileApproval(
        createTx([[pending], outsiderClaims, ownerProfile]).tx,
        { ...revoke, actorUserId: OUTSIDER }
      )
    ).toEqual({ ok: false, reason: 'forbidden' });

    const rejected = { ...pending, status: 'rejected' };
    expect(
      await revokeProfileApproval(
        createTx([[rejected], ownerClaims, ownerProfile]).tx,
        { ...revoke, actorUserId: OWNER }
      )
    ).toEqual({ ok: false, reason: 'not_pending' });
  });
});

describe('listProfileApprovals', () => {
  it('rejects invalid ids and role-less users', async () => {
    expect(
      await listProfileApprovals(createTx([]).tx, {
        profileId: 'x',
        appUserId: OWNER,
      })
    ).toEqual({ ok: false, reason: 'invalid' });
    expect(
      await listProfileApprovals(createTx([[], [], ownerProfile]).tx, {
        profileId: PROFILE,
        appUserId: OUTSIDER,
      })
    ).toEqual({ ok: false, reason: 'forbidden' });
    const { tx, updates } = createTx([
      [{ id: 's1' }],
      managerClaims,
      ownerProfile,
      [pending],
    ]);
    const r = await listProfileApprovals(tx, {
      profileId: PROFILE,
      appUserId: MANAGER,
    });
    expect(r).toEqual({ ok: true, approvals: [pending] });
    expect(updates[0]).toMatchObject({ status: 'expired' });
  });
});
