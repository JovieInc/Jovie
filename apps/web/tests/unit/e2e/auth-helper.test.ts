import type { Locator, Page } from '@playwright/test';
import { describe, expect, it, vi } from 'vitest';
import {
  fillControlledInputUntilEnabled,
  setTestAuthBypassSession,
} from '../../helpers/auth';

describe('setTestAuthBypassSession', () => {
  it('provisions a persisted actor instead of writing an arbitrary override ID', async () => {
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

    await setTestAuthBypassSession(page, 'creator-ready', 'arbitrary-non-uuid');

    expect(post).toHaveBeenCalledWith(
      'http://localhost:3100/api/dev/test-auth/session',
      { data: { persona: 'creator-ready' } }
    );
    expect(addCookies).not.toHaveBeenCalled();
  });

  it('asks the server to validate a real existing Better Auth user ID', async () => {
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

  it('ignores legacy scenario labels even when callers omit a persona', async () => {
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

describe('fillControlledInputUntilEnabled', () => {
  it('refills when hydration resets the first controlled value', async () => {
    let value = '';
    let fills = 0;
    const input = {
      isVisible: () => Promise.resolve(true),
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
