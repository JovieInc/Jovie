import { evaluateExposure } from '@jovie/release-channel-contracts/dogfood-exposure';
import { describe, expect, it, vi } from 'vitest';
import {
  expectedExposure,
  observedExposure,
  START,
} from '../../../../packages/release-channel-contracts/test-fixtures/dogfood-exposure';
import {
  dogfoodSubjectRef,
  jovieExposureAdapter,
} from './dogfood-preflight.server';
import type { DogfoodRosterResolverDeps } from './dogfood-roster.server';

function fixture() {
  const session = {
    id: 'session-1',
    accountSubject: 'account-1',
    email: 'canary+synthetic-grokbot@mail.example',
    expiresAt: new Date('2026-10-16'),
    jovieUserId: null,
  };
  const membership = {
    id: 'member-1',
    actorKey: 'synthetic:grokbot',
    products: ['jov' as const],
    scopes: ['approved_internal_features'],
    allowedModes: ['early_access' as const],
    signalState: 'qualified' as const,
    consent: {
      grantedAt: START,
      revokedAt: null,
      scope: ['dogfood'],
      source: 'direct',
    },
    membershipExpiresAt: null,
  };
  const location = {
    membership,
    binding: {
      id: 'binding-1',
      status: 'active' as const,
      expiresAt: null,
      revokedAt: null,
    },
    hasExactSessionBinding: true,
  };
  const deps: DogfoodRosterResolverDeps = {
    readSession: vi.fn().mockResolvedValue(session),
    findForAccount: vi.fn().mockResolvedValue(location),
    findForJovieUser: vi.fn(),
    findByActorKey: vi.fn().mockResolvedValue(null),
    actorHasAccount: vi.fn(),
    ensureBindings: vi.fn(),
    bootstrapSynthetic: vi.fn().mockResolvedValue(location),
  };
  const expected = expectedExposure();
  const identity = {
    ...expected.identity,
    actorRef: dogfoodSubjectRef('actor', membership.actorKey),
    accountRef: dogfoodSubjectRef('account', session.accountSubject),
    sessionRef: dogfoodSubjectRef('session', session.id),
    deviceRef: dogfoodSubjectRef('device', 'device-1'),
  };
  const runtime = {
    observe: vi.fn().mockResolvedValue({ ...observedExposure(), identity }),
    subscribe: () => () => {},
  };
  const adapter = jovieExposureAdapter({
    request: {
      sessionId: session.id,
      product: 'jov',
      mode: 'early_access',
      requestedScopes: ['approved_internal_features'],
      deviceSubject: 'device-1',
    },
    runtime,
    deps,
    now: () => new Date(START),
  });
  return {
    adapter,
    deps,
    location,
    expected: { ...expected, identity },
    runtime,
  };
}

describe('authoritative Jovie exposure adapter', () => {
  it('resolves and pseudonymizes the enrolled actor separately from the real account/session', async () => {
    const f = fixture();
    const observed = await f.adapter.observe();
    expect(evaluateExposure(f.expected, observed).status).toBe('PASS');
    expect(JSON.stringify(observed)).not.toContain('mail.example');
    expect(JSON.stringify(observed)).not.toContain('account-1');
  });
  it('rechecks revocation on every observation', async () => {
    const f = fixture();
    await f.adapter.observe();
    vi.mocked(f.deps.findForAccount).mockResolvedValue({
      ...f.location,
      membership: { ...f.location.membership, signalState: 'retired' },
    });
    expect(evaluateExposure(f.expected, await f.adapter.observe()).status).toBe(
      'BLOCKED_EXPOSURE'
    );
  });
  it('enrolls a newly authorized synthetic principal using the existing resolver', async () => {
    const f = fixture();
    vi.mocked(f.deps.findForAccount).mockResolvedValue(null);
    expect(evaluateExposure(f.expected, await f.adapter.observe()).status).toBe(
      'PASS'
    );
    expect(f.deps.bootstrapSynthetic).toHaveBeenCalledOnce();
  });
  it('cannot overwrite a mismatched in-app session with the dispatch identity', async () => {
    const f = fixture();
    f.runtime.observe.mockResolvedValue({
      ...observedExposure(),
      identity: { ...f.expected.identity, accountRef: 'other-account' },
    });
    expect(evaluateExposure(f.expected, await f.adapter.observe()).status).toBe(
      'BLOCKED_EXPOSURE'
    );
  });
});
