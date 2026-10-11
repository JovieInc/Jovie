import { describe, expect, it } from 'vitest';
import {
  decideProfileAction,
  isRiskyProfileAction,
  PROFILE_ACTION_POLICY,
  RISKY_PROFILE_ACTIONS,
  resolveTeamRole,
  TEAM_ROLES,
} from './permissions';

const OWNER = 'owner' as const;
const MANAGER = 'manager' as const;
const ASSISTANT = 'assistant' as const;
const VIEWER = 'viewer' as const;

describe('decideProfileAction', () => {
  it('allows owners to perform every risky action directly', () => {
    for (const action of RISKY_PROFILE_ACTIONS) {
      expect(decideProfileAction(OWNER, action)).toBe('allow');
    }
  });

  it('requires owner approval for delegated link mutations', () => {
    expect(decideProfileAction(MANAGER, 'links.mutate')).toBe(
      'requires_approval'
    );
    expect(decideProfileAction(ASSISTANT, 'links.mutate')).toBe(
      'requires_approval'
    );
    expect(decideProfileAction(VIEWER, 'links.mutate')).toBe('deny');
  });

  it('requires owner approval for delegated broadcasts', () => {
    expect(decideProfileAction(MANAGER, 'broadcast.send')).toBe(
      'requires_approval'
    );
    expect(decideProfileAction(ASSISTANT, 'broadcast.send')).toBe(
      'requires_approval'
    );
    expect(decideProfileAction(VIEWER, 'broadcast.send')).toBe('deny');
  });

  it('denies non-owners for owner-only identity/auth/membership actions', () => {
    for (const action of [
      'handle.change',
      'auth.change',
      'membership.manage',
    ] as const) {
      expect(decideProfileAction(MANAGER, action)).toBe('deny');
      expect(decideProfileAction(ASSISTANT, action)).toBe('deny');
      expect(decideProfileAction(VIEWER, action)).toBe('deny');
      // Owner-only actions must not be approval-able either.
      expect(PROFILE_ACTION_POLICY[action].approvable).toHaveLength(0);
    }
  });

  it('denies missing or unknown roles', () => {
    expect(decideProfileAction(null, 'links.mutate')).toBe('deny');
    expect(decideProfileAction(undefined, 'links.mutate')).toBe('deny');
  });

  it('covers every risky action in the policy map', () => {
    for (const action of RISKY_PROFILE_ACTIONS) {
      expect(PROFILE_ACTION_POLICY[action]).toBeDefined();
    }
    expect(Object.keys(PROFILE_ACTION_POLICY).sort()).toEqual(
      [...RISKY_PROFILE_ACTIONS].sort()
    );
  });
});

describe('isRiskyProfileAction', () => {
  it('accepts known actions and rejects others', () => {
    expect(isRiskyProfileAction('links.mutate')).toBe(true);
    expect(isRiskyProfileAction('membership.manage')).toBe(true);
    expect(isRiskyProfileAction('links.read')).toBe(false);
    expect(isRiskyProfileAction('')).toBe(false);
    expect(isRiskyProfileAction(42)).toBe(false);
    expect(isRiskyProfileAction(null)).toBe(false);
  });
});

describe('resolveTeamRole', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';

  it('returns the claim role when a claim exists', () => {
    expect(
      resolveTeamRole({
        appUserId: userId,
        legacyOwnerUserId: otherId,
        claimRows: [{ userId, role: 'manager' }],
      })
    ).toBe('manager');
  });

  it('returns null when claims exist but not for this user', () => {
    expect(
      resolveTeamRole({
        appUserId: userId,
        legacyOwnerUserId: userId,
        claimRows: [{ userId: otherId, role: 'owner' }],
      })
    ).toBeNull();
  });

  it('falls back to legacy owner only when no claims exist', () => {
    expect(
      resolveTeamRole({
        appUserId: userId,
        legacyOwnerUserId: userId,
        claimRows: [],
      })
    ).toBe('owner');
    expect(
      resolveTeamRole({
        appUserId: userId,
        legacyOwnerUserId: otherId,
        claimRows: [],
      })
    ).toBeNull();
  });

  it('does not let a stale legacy owner override an existing claim graph', () => {
    expect(
      resolveTeamRole({
        appUserId: userId,
        legacyOwnerUserId: userId,
        claimRows: [{ userId: otherId, role: 'owner' }],
      })
    ).toBeNull();
  });

  it('returns null for unrecognized claim roles', () => {
    expect(
      resolveTeamRole({
        appUserId: userId,
        legacyOwnerUserId: null,
        claimRows: [{ userId, role: 'superadmin' }],
      })
    ).toBeNull();
  });

  it('treats every declared team role as valid', () => {
    for (const role of TEAM_ROLES) {
      expect(
        resolveTeamRole({
          appUserId: userId,
          legacyOwnerUserId: null,
          claimRows: [{ userId, role }],
        })
      ).toBe(role);
    }
  });
});
