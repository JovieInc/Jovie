import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.auth }));
vi.mock('@/lib/auth/request-session', () => ({
  getRequestSession: mocks.session,
}));

import { loadPresenceRemovalPrincipal } from './removal-principal.server';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    userId: 'app-actor',
    sessionId: 'sess_test_bypass_app-actor',
  });
  mocks.session.mockResolvedValue({
    user: { id: 'ba-actor' },
    session: { id: 'real-session', userId: 'ba-actor' },
  });
});
it('binds the real authenticated principal/session separately from the effective app actor', async () => {
  expect(await loadPresenceRemovalPrincipal('app-actor')).toEqual({
    appActorId: 'app-actor',
    authUserId: 'ba-actor',
    sessionId: 'real-session',
    impersonationSubject: null,
  });
});
it('captures impersonation with the effective app user, never the Better Auth principal', async () => {
  mocks.auth.mockResolvedValue({
    userId: 'target-app-user',
    actorUserId: 'admin-app-user',
  });
  expect(await loadPresenceRemovalPrincipal('target-app-user')).toEqual({
    appActorId: 'target-app-user',
    authUserId: 'ba-actor',
    sessionId: 'real-session',
    impersonationSubject: 'target-app-user',
  });
});
it('rejects a stale route actor', async () => {
  expect(await loadPresenceRemovalPrincipal('other-app-user')).toBeNull();
});
it.each([
  null,
  { user: { id: '' }, session: { id: 'session', userId: '' } },
  { user: { id: 'ba-actor' }, session: { id: '', userId: 'ba-actor' } },
  { user: { id: 'ba-actor' }, session: { id: 'session', userId: 'other' } },
])('fails closed for absent or inconsistent real session %j', async session => {
  mocks.session.mockResolvedValue(session);
  expect(await loadPresenceRemovalPrincipal('app-actor')).toBeNull();
});

it('fails closed when the application actor is unavailable', async () => {
  mocks.auth.mockResolvedValue({ userId: null });
  expect(await loadPresenceRemovalPrincipal('app-actor')).toBeNull();
});
