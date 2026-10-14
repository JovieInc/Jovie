import { describe, expect, it, vi } from 'vitest';
import type {
  DogfoodExposureBinding,
  DogfoodExposureMembership,
} from './dogfood-roster';
import {
  type AuthoritativeDogfoodSession,
  type DogfoodExposureRequest,
  type DogfoodMembershipLocation,
  type DogfoodRosterResolverDeps,
  resolveDogfoodExposureForSession,
} from './dogfood-roster.server';

const now = new Date('2026-10-14T05:00:00.000Z');
const session: AuthoritativeDogfoodSession = {
  id: 'session-1',
  accountSubject: 'account-1',
  email: 'canary+synthetic-grokbot@mail.example',
  expiresAt: new Date('2026-10-15T05:00:00.000Z'),
  jovieUserId: null,
};
const member: DogfoodExposureMembership = {
  id: 'member-1',
  actorKey: 'human:one',
  products: ['jov', 'lyb'],
  scopes: ['approved_internal_features'],
  allowedModes: ['customer_control', 'early_access'],
  signalState: 'qualified',
  consent: {
    grantedAt: '2026-10-01T00:00:00.000Z',
    scope: ['dogfood'],
    source: 'direct',
    revokedAt: null,
  },
  membershipExpiresAt: null,
};
const syntheticMember = { ...member, actorKey: 'synthetic:grokbot' };

function binding(
  overrides: Partial<DogfoodExposureBinding> = {}
): DogfoodExposureBinding {
  return {
    id: 'binding-1',
    status: 'active',
    expiresAt: session.expiresAt,
    revokedAt: null,
    ...overrides,
  };
}

function location(
  membership = member,
  candidate = binding(),
  hasExactSessionBinding = true
): DogfoodMembershipLocation {
  return { membership, binding: candidate, hasExactSessionBinding };
}

function deps(
  overrides: Partial<DogfoodRosterResolverDeps> = {}
): DogfoodRosterResolverDeps {
  return {
    readSession: vi.fn().mockResolvedValue(session),
    findForAccount: vi.fn().mockResolvedValue(location()),
    findForJovieUser: vi.fn().mockResolvedValue(null),
    findByActorKey: vi.fn().mockResolvedValue(null),
    actorHasAccount: vi.fn().mockResolvedValue(false),
    ensureBindings: vi.fn().mockResolvedValue(binding()),
    bootstrapSynthetic: vi.fn().mockResolvedValue(location(syntheticMember)),
    ...overrides,
  };
}

const request: DogfoodExposureRequest = {
  sessionId: session.id,
  deviceSubject: 'device-1',
  product: 'jov' as const,
  mode: 'early_access' as const,
  requestedScopes: ['approved_internal_features'],
};

function resolve(
  overrides: Partial<DogfoodRosterResolverDeps> = {},
  requestOverrides: Partial<DogfoodExposureRequest> = {}
) {
  return resolveDogfoodExposureForSession(
    { ...request, ...requestOverrides },
    deps(overrides),
    now
  );
}

describe('resolveDogfoodExposureForSession', () => {
  it('resolves an enrolled human and an independent registered agent in Jovie and LYB', async () => {
    for (const product of ['jov', 'lyb'] as const) {
      await expect(
        resolve(
          { findForAccount: vi.fn().mockResolvedValue(location()) },
          { product }
        )
      ).resolves.toMatchObject({
        eligible: true,
        actorKey: 'human:one',
        expected: { product },
      });
      await expect(
        resolve(
          { findForAccount: vi.fn().mockResolvedValue(null) },
          { product }
        )
      ).resolves.toMatchObject({
        eligible: true,
        actorKey: 'synthetic:grokbot',
        expected: { product },
      });
    }
  });

  it('enrolls an additional session/device through an active account binding', async () => {
    const ensureBindings = vi
      .fn()
      .mockResolvedValue(binding({ id: 'binding-2' }));
    const result = await resolve(
      {
        readSession: vi.fn().mockResolvedValue({ ...session, id: 'session-2' }),
        findForAccount: vi
          .fn()
          .mockResolvedValue(location(member, binding(), false)),
        ensureBindings,
      },
      { sessionId: 'session-2', deviceSubject: 'device-2' }
    );
    expect(result).toMatchObject({ eligible: true, bindingId: 'binding-2' });
  });

  it('denies an account switch until the existing actor is explicitly mapped', async () => {
    const result = await resolve({
      findForAccount: vi.fn().mockResolvedValue(null),
      findByActorKey: vi.fn().mockResolvedValue(syntheticMember),
    });
    expect(result).toMatchObject({
      eligible: false,
      reason: 'explicit_mapping_required',
    });
  });

  it('denies stale sessions and revoked account bindings', async () => {
    await expect(
      resolve({ readSession: vi.fn().mockResolvedValue(null) })
    ).resolves.toMatchObject({ eligible: false, reason: 'invalid_session' });
    const ensureBindings = vi.fn();
    await expect(
      resolve({
        findForAccount: vi
          .fn()
          .mockResolvedValue(
            location(
              member,
              binding({ status: 'revoked', revokedAt: now }),
              false
            )
          ),
        ensureBindings,
      })
    ).resolves.toMatchObject({ eligible: false, reason: 'stale_binding' });
    expect(ensureBindings).not.toHaveBeenCalled();
  });
});
