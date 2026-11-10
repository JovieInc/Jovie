import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMITTED_CANARY_FIXTURE } from './admitted-canary-fixture';

const F = ADMITTED_CANARY_FIXTURE;

const hoisted = vi.hoisted(() => ({
  queue: [] as unknown[][],
  decide: vi.fn(),
  audit: vi.fn(),
  signup: vi.fn(),
  approve: vi.fn(),
  invalidate: vi.fn(),
  assertAvailable: vi.fn(),
  inserted: [] as unknown[],
  txTaken: [] as unknown[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => hoisted.queue.shift() ?? [],
  };
  return { db: chain };
});
vi.mock('@/lib/db/legacy-transaction', () => ({
  runAtomicDbOperation: async (fn: (tx: unknown) => unknown) => {
    const tx = {
      select: () => tx,
      from: () => tx,
      where: () => tx,
      limit: async () => hoisted.txTaken,
      insert: () => ({
        values: (row: unknown) => {
          hoisted.inserted.push(row);
          return {
            onConflictDoNothing: async () => undefined,
            then: (resolve: (v: undefined) => void) => resolve(undefined),
          };
        },
      }),
    };
    return fn(tx);
  },
}));
vi.mock('@/lib/claim/claim-verification-review.server', () => ({
  decideClaimVerification: hoisted.decide,
}));
vi.mock('@/lib/waitlist/audit', () => ({
  insertWaitlistAuditLog: hoisted.audit,
}));
vi.mock('@/lib/waitlist/signup-entry', () => ({
  insertSignupWaitlistEntry: hoisted.signup,
}));
vi.mock('@/lib/waitlist/approval', () => ({
  approveWaitlistEntryInTx: hoisted.approve,
}));
vi.mock('@/lib/auth/proxy-state', () => ({
  invalidateProxyUserStateCache: hoisted.invalidate,
}));
vi.mock('@/lib/profile/spotify-profile-identity', () => ({
  assertSpotifyProfileIdentityAvailable: hoisted.assertAvailable,
}));

const { readAdmittedCanaryState, reconcileAdmittedCanary } = await import(
  './admitted-canary.server'
);

const user = { id: 'u1', waitlistEntryId: 'w1', userStatus: 'active' };
const entry = (status: string) => ({ id: 'w1', status });
const verifiedSettings = {
  claimVerification: {
    schema: 'jovie-claim-verification/v1',
    status: 'verified',
    spotifyArtistId: F.artist.spotifyId,
    requestedAt: '2026-10-31T00:00:00.000Z',
    reach: { signal: 'spotify_followers', value: 0, threshold: 1 },
  },
};
const profile = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  handle: F.handle,
  spotifyId: F.artist.spotifyId,
  userId: null,
  waitlistEntryId: 'w1',
  isClaimed: false,
  isPublic: false,
  settings: {},
  ...over,
});

/** Queue the rows one `readAdmittedCanaryState` consumes, in query order. */
function queueRead(s: {
  user?: unknown;
  entry?: unknown;
  profile?: ReturnType<typeof profile>;
  holder?: boolean;
  claim?: boolean;
}) {
  hoisted.queue.push(
    s.user ? [s.user] : [],
    s.entry ? [s.entry] : [],
    s.profile ? [s.profile] : [],
    s.holder ? [{ id: 'other' }] : []
  );
  const ours =
    s.profile &&
    ((s.user && s.profile.userId === (s.user as { id: string }).id) ||
      (s.entry &&
        s.profile.waitlistEntryId === (s.entry as { id: string }).id));
  if (ours && s.user) hoisted.queue.push(s.claim ? [{ id: 'c1' }] : []);
}

describe('readAdmittedCanaryState', () => {
  beforeEach(() => {
    hoisted.queue = [];
  });

  it('reports an empty fixture as nothing observed', async () => {
    queueRead({});
    await expect(readAdmittedCanaryState()).resolves.toEqual({
      user: null,
      waitlistEntry: null,
      profile: null,
      ownerClaimRow: false,
      handleHeldByOther: false,
      artistHeldByOther: false,
    });
  });

  it('maps a converged fixture including the owner claim and proof', async () => {
    queueRead({
      user,
      entry: entry(F.waitlistTargetStatus),
      profile: profile({
        userId: 'u1',
        isClaimed: true,
        isPublic: true,
        settings: verifiedSettings,
      }),
      claim: true,
    });
    const state = await readAdmittedCanaryState();
    expect(state.user).toEqual({
      id: 'u1',
      waitlistEntryId: 'w1',
      userStatus: 'active',
    });
    expect(state.ownerClaimRow).toBe(true);
    expect(state.profile).toMatchObject({
      id: 'p1',
      isClaimed: true,
      isPublic: true,
      claimVerificationStatus: 'verified',
    });
  });

  it('flags a handle held by a profile that is not the canary', async () => {
    queueRead({
      user,
      entry: entry('waitlisted'),
      profile: profile({ userId: 'someone-else', waitlistEntryId: 'w9' }),
    });
    const state = await readAdmittedCanaryState();
    expect(state.profile).toBeNull();
    expect(state.handleHeldByOther).toBe(true);
  });

  it('flags the Spotify identity held elsewhere', async () => {
    queueRead({ user, entry: entry('waitlisted'), holder: true });
    expect((await readAdmittedCanaryState()).artistHeldByOther).toBe(true);
  });
});

describe('reconcileAdmittedCanary', () => {
  beforeEach(() => {
    hoisted.queue = [];
    hoisted.inserted = [];
    hoisted.txTaken = [];
    for (const m of [
      hoisted.decide,
      hoisted.audit,
      hoisted.signup,
      hoisted.approve,
      hoisted.invalidate,
      hoisted.assertAvailable,
    ]) {
      m.mockReset();
    }
  });

  it('refuses a fixture whose email is not the canary address', async () => {
    await expect(
      reconcileAdmittedCanary({
        apply: false,
        fixture: { ...F, email: 'artist@gmail.com' },
      })
    ).rejects.toThrow(/not the canary/);
  });

  it('dry run plans every missing step and writes nothing', async () => {
    queueRead({});
    const out = await reconcileAdmittedCanary({ apply: false });
    expect(out.converged).toBe(false);
    expect(out.steps.map(s => [s.id, s.outcome])).toEqual([
      ['user', 'planned'],
      ['waitlist_entry', 'planned'],
      ['profile', 'planned'],
      ['waitlist_approval', 'planned'],
      ['owner_claim', 'planned'],
      ['ownership_proof', 'planned'],
    ]);
    expect(hoisted.signup).not.toHaveBeenCalled();
    expect(hoisted.decide).not.toHaveBeenCalled();
  });

  it('apply stops with a product-path instruction when the user is missing', async () => {
    queueRead({});
    const out = await reconcileAdmittedCanary({ apply: true });
    expect(out.converged).toBe(false);
    expect(out.steps).toHaveLength(1);
    expect(out.steps[0]).toMatchObject({
      id: 'user',
      outcome: 'failed',
      error: 'sign the canary in through the product first',
    });
    expect(hoisted.signup).not.toHaveBeenCalled();
  });

  it('apply stops at a blocked step instead of writing', async () => {
    queueRead({ user, entry: entry('waitlisted'), holder: true });
    const out = await reconcileAdmittedCanary({ apply: true });
    expect(out.converged).toBe(false);
    const last = out.steps.at(-1);
    expect(last).toMatchObject({ id: 'profile', outcome: 'failed' });
    expect(hoisted.inserted).toEqual([]);
  });

  it('apply records a failing step and stops', async () => {
    queueRead({ user });
    hoisted.signup.mockRejectedValue(new Error('db down'));
    const out = await reconcileAdmittedCanary({ apply: true });
    expect(out.steps.map(s => [s.id, s.outcome])).toEqual([
      ['user', 'skipped'],
      ['waitlist_entry', 'failed'],
    ]);
    expect(out.steps[1].error).toBe('db down');
  });

  it('apply converges a signed-in canary step by step, re-reading state after each write', async () => {
    hoisted.signup.mockResolvedValue(undefined);
    hoisted.approve.mockResolvedValue({ outcome: 'approved', clerkId: 'c9' });
    hoisted.decide.mockResolvedValue({ outcome: 'decided', record: {} });
    // initial plan, then one re-read after each applied step
    queueRead({ user });
    queueRead({ user, entry: entry('waitlisted') });
    queueRead({ user, entry: entry('waitlisted'), profile: profile() });
    queueRead({
      user,
      entry: entry(F.waitlistTargetStatus),
      profile: profile({ userId: 'u1', isClaimed: true }),
    });
    queueRead({
      user,
      entry: entry(F.waitlistTargetStatus),
      profile: profile({ userId: 'u1', isClaimed: true }),
      claim: true,
    });
    // ownership_proof reads the owner join row before deciding
    hoisted.queue.push([
      {
        handle: F.handle,
        spotifyId: F.artist.spotifyId,
        settings: {},
        ownerEmail: F.email,
        waitlistEntryId: 'w1',
      },
    ]);
    queueRead({
      user,
      entry: entry(F.waitlistTargetStatus),
      profile: profile({
        userId: 'u1',
        isClaimed: true,
        isPublic: true,
        settings: verifiedSettings,
      }),
      claim: true,
    });

    const out = await reconcileAdmittedCanary({ apply: true });

    expect(out.steps.map(s => [s.id, s.outcome])).toEqual([
      ['user', 'skipped'],
      ['waitlist_entry', 'done'],
      ['profile', 'done'],
      ['waitlist_approval', 'done'],
      ['owner_claim', 'done'],
      ['ownership_proof', 'done'],
    ]);
    expect(out.converged).toBe(true);
    expect(hoisted.signup).toHaveBeenCalledWith(expect.anything(), F.email);
    expect(hoisted.assertAvailable).toHaveBeenCalledWith(
      expect.anything(),
      F.artist.spotifyId,
      null
    );
    expect(hoisted.inserted).toEqual([
      expect.objectContaining({
        usernameNormalized: F.handle,
        spotifyId: F.artist.spotifyId,
        isClaimed: false,
        isPublic: false,
        waitlistEntryId: 'w1',
      }),
      expect.objectContaining({
        userId: 'u1',
        creatorProfileId: 'p1',
        role: 'owner',
      }),
    ]);
    expect(hoisted.approve).toHaveBeenCalledWith(
      expect.anything(),
      'w1',
      expect.objectContaining({ actorType: 'system' })
    );
    expect(hoisted.invalidate).toHaveBeenCalledWith('c9');
    expect(hoisted.decide).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'p1', decision: 'approve' })
    );
  });

  it('fails the approval step when the waitlist outcome is not approved', async () => {
    hoisted.approve.mockResolvedValue({ outcome: 'not_found' });
    queueRead({
      user,
      entry: entry('waitlisted'),
      profile: profile({ userId: 'u1' }),
    });
    const out = await reconcileAdmittedCanary({ apply: true });
    const approval = out.steps.find(s => s.id === 'waitlist_approval');
    expect(approval).toMatchObject({ outcome: 'failed' });
    expect(approval?.error).toMatch(/Approval outcome: not_found/);
    expect(hoisted.invalidate).not.toHaveBeenCalled();
  });

  it('fails profile creation when the handle was taken between plan and write', async () => {
    hoisted.txTaken = [{ id: 'racer' }];
    queueRead({ user, entry: entry('waitlisted') });
    const out = await reconcileAdmittedCanary({ apply: true });
    const created = out.steps.find(s => s.id === 'profile');
    expect(created).toMatchObject({ outcome: 'failed' });
    expect(created?.error).toMatch(/held by another profile/);
    expect(hoisted.inserted).toEqual([]);
  });
});
