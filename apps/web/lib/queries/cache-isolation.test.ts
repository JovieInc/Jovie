import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyCacheScope,
  copyShareableQueryData,
  getCacheGeneration,
  getCacheScope,
  resetCacheIsolationForTests,
  subscribeCacheFence,
  withCacheScope,
} from '@/lib/queries/cache-isolation';
import { queryKeys } from '@/lib/queries/keys';

describe('JOV-6186 cache isolation', () => {
  beforeEach(() => {
    resetCacheIsolationForTests();
  });

  afterEach(() => {
    resetCacheIsolationForTests();
  });

  it('treats the first ready auth identity as hydrate, not a fence', () => {
    const event = applyCacheScope({
      userId: 'user-a',
      sessionId: 'sess-a',
      ready: true,
    });

    expect(event?.reason).toBe('hydrate');
    expect(event?.changed).toBe(false);
    expect(getCacheGeneration()).toBe(0);
    expect(getCacheScope()).toMatchObject({
      userId: 'user-a',
      sessionId: 'sess-a',
    });
  });

  it('advances generation on account change and sign-out, not on public-key reuse', () => {
    applyCacheScope({
      userId: 'user-a',
      sessionId: 'sess-a',
      profileId: 'profile-a',
      ready: true,
    });
    const generationAfterHydrate = getCacheGeneration();

    const accountChange = applyCacheScope({
      userId: 'user-b',
      sessionId: 'sess-b',
      profileId: 'profile-b',
    });
    expect(accountChange?.reason).toBe('account-change');
    expect(accountChange?.changed).toBe(true);
    expect(getCacheGeneration()).toBeGreaterThan(generationAfterHydrate);

    const signedOut = applyCacheScope({
      userId: null,
      sessionId: null,
      profileId: null,
    });
    expect(signedOut?.reason).toBe('sign-out');
    expect(signedOut?.changed).toBe(true);
  });

  it('classifies same-account profile changes separately from sign-out', () => {
    applyCacheScope({
      userId: 'user-a',
      sessionId: 'sess-a',
      profileId: 'profile-a',
      ready: true,
    });

    const switched = applyCacheScope({ profileId: 'profile-b' });
    expect(switched?.reason).toBe('profile-switch');
    expect(switched?.changed).toBe(true);
    expect(getCacheScope().userId).toBe('user-a');
    expect(getCacheScope().profileId).toBe('profile-b');
  });

  it('keeps account/public query data on profile-switch and drops private profile data', () => {
    const previous = new QueryClient();
    const next = new QueryClient();
    previous.setQueryData(queryKeys.user.profile(), {
      id: 'profile-a',
      displayName: 'A',
    });
    previous.setQueryData(queryKeys.billing.status(), { plan: 'pro' });
    previous.setQueryData(queryKeys.profile.byUsername('public-artist'), {
      username: 'public-artist',
    });
    previous.setQueryData(queryKeys.dashboard.analytics(), { views: 9 });

    const copied = copyShareableQueryData(previous, next, 'profile-switch');

    expect(copied).toBeGreaterThan(0);
    expect(next.getQueryData(queryKeys.user.profile())).toBeUndefined();
    expect(next.getQueryData(queryKeys.dashboard.analytics())).toBeUndefined();
    expect(next.getQueryData(queryKeys.billing.status())).toEqual({
      plan: 'pro',
    });
    expect(
      next.getQueryData(queryKeys.profile.byUsername('public-artist'))
    ).toEqual({ username: 'public-artist' });
  });

  it('drops all private query data on account-change so A cannot become B mutation input', () => {
    const previous = new QueryClient();
    const next = new QueryClient();
    previous.setQueryData(queryKeys.user.profile(), {
      id: 'profile-a',
      displayName: 'A',
    });
    previous.setQueryData(queryKeys.billing.status(), { plan: 'pro' });

    const copied = copyShareableQueryData(previous, next, 'account-change');

    expect(copied).toBe(0);
    expect(next.getQueryData(queryKeys.user.profile())).toBeUndefined();
    expect(next.getQueryData(queryKeys.billing.status())).toBeUndefined();
  });

  it('does not write a late A query result onto the fenced B client', async () => {
    let resolveProfile: ((value: { id: string }) => void) | undefined;
    const previous = new QueryClient({
      defaultOptions: { queries: { retry: 0 } },
    });
    const fetchPromise = previous.fetchQuery({
      queryKey: queryKeys.user.profile(),
      queryFn: () =>
        new Promise<{ id: string }>(resolve => {
          resolveProfile = resolve;
        }),
    });

    applyCacheScope({
      userId: 'user-a',
      sessionId: 'sess-a',
      ready: true,
    });
    const fence = applyCacheScope({
      userId: 'user-b',
      sessionId: 'sess-b',
    });
    expect(fence?.changed).toBe(true);

    await previous.cancelQueries({ queryKey: queryKeys.user.profile() });
    previous.clear();
    const next = new QueryClient();
    copyShareableQueryData(previous, next, 'account-change');

    if (!resolveProfile) {
      throw new Error('expected the delayed profile resolver');
    }
    resolveProfile({ id: 'profile-a' });
    await fetchPromise.catch(() => undefined);

    expect(next.getQueryData(queryKeys.user.profile())).toBeUndefined();
    expect(previous.getQueryData(queryKeys.user.profile())).not.toEqual({
      id: 'profile-a',
    });
  });

  it('namespaces keys with nonsecret identifiers and never includes a token', () => {
    applyCacheScope({
      userId: 'user-a',
      sessionId: 'sess-a',
      profileId: 'profile-a',
      ready: true,
    });

    const key = withCacheScope(queryKeys.user.profile(), getCacheScope(), {
      token: 'sk_live_should_never_appear',
    });
    const serialized = JSON.stringify(key);

    expect(key).toContain('user-a');
    expect(key).toContain('profile-a');
    expect(serialized).not.toContain('sk_live');
    expect(serialized).not.toContain('token');
  });

  it('keeps isolated QueryClients from sharing data (SSR request-local)', () => {
    const first = new QueryClient();
    const second = new QueryClient();
    first.setQueryData(queryKeys.user.profile(), { id: 'ssr-a' });

    expect(second.getQueryData(queryKeys.user.profile())).toBeUndefined();
  });

  it('does not notify an unsubscribed fence listener', () => {
    const listener = vi.fn();
    applyCacheScope({
      userId: 'user-a',
      sessionId: 'sess-a',
      profileId: 'profile-a',
      ready: true,
    });
    const unsubscribe = subscribeCacheFence(listener);
    unsubscribe();

    applyCacheScope({ profileId: 'profile-b' });
    expect(listener).not.toHaveBeenCalled();
  });
});
