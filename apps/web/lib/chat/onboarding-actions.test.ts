import { describe, expect, it } from 'vitest';
import {
  type OnboardingActionKind,
  type OnboardingActionState,
  projectOnboardingAction,
} from './onboarding-actions';

const unknown: OnboardingActionState = {
  signedIn: null,
  identity: { status: 'unknown' as const },
  canClaim: null,
  canEdit: null,
  canPublish: null,
  offerAvailable: null,
  access: 'unknown',
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
  'start_access',
];
const routes = Object.fromEntries(kinds.map(kind => [kind, `/test/${kind}`]));

describe('current-state onboarding action projection', () => {
  it('projects anonymous start access only from a current instant-access decision and available offer', () => {
    const admitted: OnboardingActionState = {
      ...unknown,
      signedIn: false,
      identity: { status: 'unclaimed', subjectId: 'artist-1' },
      access: 'instant_access',
      offerAvailable: true,
      routes: { start_access: '/onboarding/checkout' },
    };
    expect(projectOnboardingAction(admitted, 'start_access')).toEqual({
      kind: 'start_access',
      interaction: 'navigate',
      label: 'Continue to signup',
      href: '/onboarding/checkout',
    });
    for (const access of ['waitlist', 'needs_more_info', 'unknown'] as const) {
      expect(
        projectOnboardingAction({ ...admitted, access }, 'start_access')
      ).toBeNull();
    }
    for (const patch of [
      { signedIn: null },
      { offerAvailable: false },
      { offerAvailable: null },
      { identity: { status: 'unknown' as const } },
      { identity: { status: 'owned' as const, subjectId: 'artist-1' } },
      { routes: {} },
    ])
      expect(
        projectOnboardingAction({ ...admitted, ...patch }, 'start_access')
      ).toBeNull();
    expect(
      projectOnboardingAction(
        { ...admitted, routes: { upgrade: '/billing' } },
        'upgrade'
      )
    ).toBeNull();
    expect(
      projectOnboardingAction(
        {
          ...admitted,
          signedIn: true,
          identity: { status: 'owned', subjectId: 'artist-1' },
        },
        'start_access'
      )?.kind
    ).toBe('start_access');
  });

  it('binds explicit authenticated Keep consent to a command, never a GET mutation destination', () => {
    const eligible: OnboardingActionState = {
      ...unknown,
      signedIn: true,
      identity: { status: 'unclaimed', subjectId: 'artist-1' },
      canClaim: true,
    };
    const command = projectOnboardingAction(eligible, 'claim_profile');
    expect(command).toEqual({
      kind: 'claim_profile',
      interaction: 'command',
      command: 'claim_profile',
      label: 'Keep this profile',
      subjectId: 'artist-1',
    });
    expect(command).not.toHaveProperty('href');
    for (const patch of [
      { signedIn: false },
      { signedIn: null },
      { canClaim: null },
      { canClaim: false },
      { identity: { status: 'unknown' as const } },
      { identity: { status: 'owned' as const, subjectId: 'artist-1' } },
      { identity: { status: 'unclaimed' as const, subjectId: '' } },
      { identity: { status: 'unclaimed' as const, subjectId: ' artist-1' } },
    ])
      expect(
        projectOnboardingAction({ ...eligible, ...patch }, 'claim_profile')
      ).toBeNull();
  });

  it('does not convert no conflict, enrichment identity, or model confidence into verified ownership', () => {
    const permissionsOnly: OnboardingActionState = {
      ...unknown,
      signedIn: true,
      canClaim: true,
      canEdit: true,
      canPublish: true,
      access: 'instant_access',
      offerAvailable: true,
      routes,
    };
    for (const kind of [
      'claim_profile',
      'edit_profile',
      'publish_profile',
      'upgrade',
      'start_access',
    ] as const) {
      expect(projectOnboardingAction(permissionsOnly, kind)).toBeNull();
    }
  });
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
      identity: { status: 'conflict' as const, subjectId: 'artist-1' },
      canClaim: true,
      canEdit: true,
      canPublish: true,
      offerAvailable: true,
      routes,
    };
    for (const kind of [...kinds, null]) {
      expect(projectOnboardingAction(conflict, kind)).toEqual({
        kind: 'recover_profile',
        interaction: 'navigate',
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
      identity: { status: 'conflict' as const, subjectId: 'artist-1' },
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
        identity: { status: 'owned' as const, subjectId: 'artist-1' },
        canEdit: true,
        canPublish: true,
        routes,
      };
      expect(projectOnboardingAction(allowed, kind)?.kind).toBe(kind);
      for (const patch of [
        { signedIn: false },
        { signedIn: null },
        { identity: { status: 'unclaimed' as const, subjectId: 'artist-1' } },
        { identity: { status: 'unknown' as const } },
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
        {
          ...unknown,
          identity: { status: 'owned' as const, subjectId: 'artist-1' },
          canClaim: true,
          routes,
        },
        'claim_profile'
      )
    ).toBeNull();
    expect(
      projectOnboardingAction(
        {
          ...unknown,
          signedIn: true,
          identity: { status: 'unclaimed' as const, subjectId: 'artist-1' },
          canClaim: true,
          routes,
        },
        'claim_profile'
      )?.kind
    ).toBe('claim_profile');
    expect(
      projectOnboardingAction(
        {
          ...unknown,
          identity: { status: 'unclaimed' as const, subjectId: 'artist-1' },
          canClaim: false,
          routes,
        },
        'claim_profile'
      )
    ).toBeNull();
  });

  it('requires an available offer and signed-in context rather than model confidence', () => {
    const eligible = {
      ...unknown,
      signedIn: true,
      offerAvailable: true,
      identity: { status: 'owned' as const, subjectId: 'artist-1' },
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
      interaction: 'navigate',
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
      )
    ).toMatchObject({ interaction: 'navigate', href });
  });
});
