import { describe, expect, it } from 'vitest';
import {
  type OnboardingActionKind,
  type OnboardingActionState,
  projectOnboardingAction,
} from './onboarding-actions';

const unknown: OnboardingActionState = {
  signedIn: null,
  ownership: 'unknown',
  canClaim: null,
  canEdit: null,
  canPublish: null,
  offerAvailable: null,
  routes: {},
};
const kinds: OnboardingActionKind[] = [
  'sign_in',
  'recover_profile',
  'view_profile',
  'edit_profile',
  'publish_profile',
  'claim_profile',
  'upgrade',
];
const routes = Object.fromEntries(kinds.map(kind => [kind, `/test/${kind}`]));

describe('current-state onboarding action projection', () => {
  it('does not turn unknown permission or an absent route into an action', () => {
    for (const kind of kinds) {
      expect(projectOnboardingAction(unknown, kind)).toBeNull();
      if (kind !== 'view_profile') {
        expect(
          projectOnboardingAction({ ...unknown, routes }, kind)
        ).toBeNull();
      }
    }
    expect(projectOnboardingAction({ ...unknown, routes }, null)).toBeNull();
  });

  it('replaces every stale proposal with the verified recovery route on conflict', () => {
    const conflict: OnboardingActionState = {
      ...unknown,
      signedIn: true,
      ownership: 'conflict',
      canClaim: true,
      canEdit: true,
      canPublish: true,
      offerAvailable: true,
      routes,
    };
    for (const kind of [...kinds, null]) {
      expect(projectOnboardingAction(conflict, kind)).toEqual({
        kind: 'recover_profile',
        label: 'Recover this profile',
        href: '/test/recover_profile',
      });
    }
    expect(
      projectOnboardingAction({ ...conflict, routes: {} }, 'claim_profile')
    ).toBeNull();
  });

  it('offers original-account sign-in only when signed out and recovery is unavailable', () => {
    const conflict = {
      ...unknown,
      ownership: 'conflict' as const,
      routes: { sign_in: '/signin' },
    };
    expect(
      projectOnboardingAction({ ...conflict, signedIn: false }, 'claim_profile')
        ?.kind
    ).toBe('sign_in');
    expect(projectOnboardingAction(conflict, 'claim_profile')).toBeNull();
    expect(
      projectOnboardingAction({ ...conflict, signedIn: true }, 'claim_profile')
    ).toBeNull();
  });

  it('requires both verified ownership and the exact permission for edit/publish', () => {
    for (const kind of ['edit_profile', 'publish_profile'] as const) {
      const allowed: OnboardingActionState = {
        ...unknown,
        signedIn: true,
        ownership: 'owned',
        canEdit: true,
        canPublish: true,
        routes,
      };
      expect(projectOnboardingAction(allowed, kind)?.kind).toBe(kind);
      for (const patch of [
        { signedIn: false },
        { signedIn: null },
        { ownership: 'unclaimed' as const },
        { ownership: 'unknown' as const },
        { canEdit: false, canPublish: false },
        { canEdit: null, canPublish: null },
        { routes: {} },
      ])
        expect(
          projectOnboardingAction({ ...allowed, ...patch }, kind)
        ).toBeNull();
    }
  });

  it('never offers a fresh handle or claim for an already-owned identity', () => {
    expect(
      projectOnboardingAction(
        { ...unknown, ownership: 'owned', canClaim: true, routes },
        'claim_profile'
      )
    ).toBeNull();
    expect(
      projectOnboardingAction(
        { ...unknown, ownership: 'unclaimed', canClaim: true, routes },
        'claim_profile'
      )?.kind
    ).toBe('claim_profile');
    expect(
      projectOnboardingAction(
        { ...unknown, ownership: 'unclaimed', canClaim: false, routes },
        'claim_profile'
      )
    ).toBeNull();
  });

  it('requires an available offer and signed-in context rather than model confidence', () => {
    const eligible = {
      ...unknown,
      signedIn: true,
      offerAvailable: true,
      routes,
    };
    expect(projectOnboardingAction(eligible, 'upgrade')?.kind).toBe('upgrade');
    for (const patch of [
      { offerAvailable: false },
      { offerAvailable: null },
      { signedIn: false },
      { signedIn: null },
    ]) {
      expect(
        projectOnboardingAction({ ...eligible, ...patch }, 'upgrade')
      ).toBeNull();
    }
  });

  it('uses a verified view path without implying permission to edit or claim', () => {
    expect(
      projectOnboardingAction({ ...unknown, routes }, 'view_profile')
    ).toEqual({
      kind: 'view_profile',
      label: 'View this profile',
      href: '/test/view_profile',
    });
    expect(
      projectOnboardingAction(
        { ...unknown, signedIn: false, routes },
        'sign_in'
      )?.kind
    ).toBe('sign_in');
  });

  it('rejects dangerous or malformed destinations and preserves safe continuation query', () => {
    for (const href of [
      'https://evil.invalid',
      '//evil.invalid',
      '/\\evil.invalid',
      '/%2fevil.invalid',
      '/%5cevil.invalid',
      '/path\n',
      ' /path',
      '/%00bad',
      '/%zz',
    ]) {
      expect(
        projectOnboardingAction(
          { ...unknown, routes: { view_profile: href } },
          'view_profile'
        )
      ).toBeNull();
    }
    const href = '/signin?returnTo=%2Fstart';
    expect(
      projectOnboardingAction(
        { ...unknown, signedIn: false, routes: { sign_in: href } },
        'sign_in'
      )?.href
    ).toBe(href);
  });
});
