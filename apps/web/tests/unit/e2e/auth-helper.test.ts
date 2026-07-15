import type { Locator, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import {
  fillControlledInputUntilEnabled,
  resolveBypassFallbackUserId,
  setTestAuthBypassSession,
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
