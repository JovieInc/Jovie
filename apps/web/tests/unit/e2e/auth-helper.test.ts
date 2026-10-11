import type { Locator, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import {
  fillControlledInputUntilEnabled,
  resolveBypassFallbackUserId,
  setTestAuthBypassSession,
  signInUser,
} from '../../helpers/auth';

describe('fillControlledInputUntilEnabled', () => {
  it('refills when hydration resets the first controlled value', async () => {
    let value = '';
    let fills = 0;
    const input = {
      fill: vi.fn(async (next: string) => {
        fills += 1;
        value = fills === 1 ? '' : next;
      }),
      inputValue: () => Promise.resolve(value),
    } as unknown as Locator;
    const submit = {
      isEnabled: () => Promise.resolve(Boolean(value)),
    } as unknown as Locator;

    await fillControlledInputUntilEnabled(
      input,
      submit,
      'artist@test.jovie.com'
    );

    expect(input.fill).toHaveBeenCalledTimes(2);
  });
});

describe('resolveBypassFallbackUserId', () => {
  it('returns the persisted UUID identity for a persona cookie fallback', () => {
    const creatorId = resolveBypassFallbackUserId('creator-ready');

    expect(creatorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(creatorId).not.toMatch(/^ba_dev_/);
    expect(creatorId).toBe(resolveBypassFallbackUserId('creator-ready'));
  });
});

describe('signInUser test-auth bypass navigation', () => {
  function withBypassEnv<T>(run: () => Promise<T>) {
    const originalBypass = process.env.E2E_USE_TEST_AUTH_BYPASS;
    const originalBaseUrl = process.env.BASE_URL;
    process.env.E2E_USE_TEST_AUTH_BYPASS = '1';
    delete process.env.BASE_URL;

    return run().finally(() => {
      if (originalBypass === undefined) {
        delete process.env.E2E_USE_TEST_AUTH_BYPASS;
      } else {
        process.env.E2E_USE_TEST_AUTH_BYPASS = originalBypass;
      }
      if (originalBaseUrl === undefined) {
        delete process.env.BASE_URL;
      } else {
        process.env.BASE_URL = originalBaseUrl;
      }
    });
  }

  function buildPage(enterStatus = 303) {
    const requestGet = vi.fn(
      async (
        _url: string,
        _options?: { maxRedirects?: number; timeout?: number }
      ) => ({
        status: () => enterStatus,
        text: () => Promise.resolve('enter error body'),
      })
    );
    const goto = vi.fn(
      async (_url: string, _options?: Parameters<Page['goto']>[1]) =>
        ({ status: () => 200 }) as unknown as Awaited<ReturnType<Page['goto']>>
    );
    const readyLocator = { isVisible: () => Promise.resolve(true) };
    const page = {
      request: { get: requestGet },
      goto,
      url: () => 'http://localhost:3100/app',
      waitForURL: () => Promise.resolve(),
      locator: () => ({ first: () => readyLocator }),
    } as unknown as Page;
    return { page, requestGet, goto };
  }

  it('mints the session over request API so the enter route is not gated on the cold /app compile (JOV-7559)', async () => {
    const { page, requestGet, goto } = buildPage();

    await withBypassEnv(() => signInUser(page));

    expect(requestGet).toHaveBeenCalledWith(
      'http://localhost:3100/api/dev/test-auth/enter?persona=creator&redirect=/app&session=better-auth',
      expect.objectContaining({
        maxRedirects: 0,
        timeout: expect.any(Number),
      })
    );
    const { timeout } = requestGet.mock.calls[0][1] ?? {};
    expect(timeout).toBeGreaterThan(45_000);
    expect(goto).toHaveBeenCalledWith(
      'http://localhost:3100/app',
      expect.objectContaining({ timeout: expect.any(Number) })
    );
  });

  it('fails closed when the enter route does not 303', async () => {
    const { page, goto } = buildPage(404);

    await expect(withBypassEnv(() => signInUser(page))).rejects.toMatchObject({
      code: 'CLERK_SETUP_FAILED',
    });
    expect(goto).not.toHaveBeenCalled();
  });
});

describe('setTestAuthBypassSession', () => {
  it('provisions a persisted actor instead of writing a synthetic user ID cookie', async () => {
    const post = vi.fn().mockResolvedValue({
      ok: () => true,
      status: () => 200,
      json: () =>
        Promise.resolve({ success: true, userId: 'ba_dev_creator-ready' }),
    });
    const addCookies = vi.fn();
    const page = {
      request: { post },
      context: () => ({ addCookies }),
    } as unknown as Page;

    await setTestAuthBypassSession(page, 'creator-ready', 'user_test');

    expect(post).toHaveBeenCalledWith(
      'http://localhost:3100/api/dev/test-auth/session',
      { data: { persona: 'creator-ready' } }
    );
    expect(addCookies).not.toHaveBeenCalled();
  });

  it('asks the server to validate an existing Better Auth user ID', async () => {
    const post = vi.fn().mockResolvedValue({
      ok: () => true,
      status: () => 200,
      json: () => Promise.resolve({ success: true, userId: 'ba-real-user' }),
    });
    const page = { request: { post } } as unknown as Page;

    await setTestAuthBypassSession(page, null, 'ba-real-user');

    expect(post).toHaveBeenCalledWith(
      'http://localhost:3100/api/dev/test-auth/session',
      { data: { persona: 'creator', existingUserId: 'ba-real-user' } }
    );
  });

  it('ignores legacy scenario labels when callers omit a persona', async () => {
    const post = vi.fn().mockResolvedValue({
      ok: () => true,
      status: () => 200,
      json: () => Promise.resolve({ success: true, userId: 'ba_dev_creator' }),
    });
    const page = { request: { post } } as unknown as Page;

    await setTestAuthBypassSession(page, null, 'e2e-chat-timeline');

    expect(post).toHaveBeenCalledWith(
      'http://localhost:3100/api/dev/test-auth/session',
      { data: { persona: 'creator' } }
    );
  });

  it('fails closed when the server rejects an unknown existing user ID', async () => {
    const post = vi.fn().mockResolvedValue({
      ok: () => false,
      status: () => 404,
      json: () =>
        Promise.resolve({
          success: false,
          error: 'Unknown Better Auth test user',
        }),
    });
    const page = { request: { post } } as unknown as Page;

    await expect(
      setTestAuthBypassSession(page, null, 'unknown-real-user')
    ).rejects.toMatchObject({ code: 'CLERK_SETUP_FAILED' });
  });
});
