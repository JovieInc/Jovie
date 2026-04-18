import { afterEach, describe, expect, it, vi } from 'vitest';
import { addAvatarCacheBust } from '@/app/api/dashboard/profile/lib/response';

describe('addAvatarCacheBust', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('appends a cache-bust query param to relative avatar URLs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T10:20:00.000Z'));

    const profile = {
      avatarUrl: '/avatars/default-user.png',
    } as Parameters<typeof addAvatarCacheBust>[0];

    const result = addAvatarCacheBust(profile);

    expect(result.avatarUrl).toBe('/avatars/default-user.png?v=1776334800000');
  });

  it('replaces an existing cache-bust query param on relative avatar URLs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T10:20:00.000Z'));

    const profile = {
      avatarUrl: '/avatars/default-user.png?size=large&v=123',
    } as Parameters<typeof addAvatarCacheBust>[0];

    const result = addAvatarCacheBust(profile);

    expect(result.avatarUrl).toBe(
      '/avatars/default-user.png?size=large&v=1776334800000'
    );
  });

  it('preserves protocol-relative avatar hosts when adding a cache-bust query param', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T10:20:00.000Z'));

    const profile = {
      avatarUrl: '//cdn.example.com/avatars/default-user.png?size=large',
    } as Parameters<typeof addAvatarCacheBust>[0];

    const result = addAvatarCacheBust(profile);

    expect(result.avatarUrl).toBe(
      '//cdn.example.com/avatars/default-user.png?size=large&v=1776334800000'
    );
  });

  it('leaves malformed absolute avatar URLs unchanged', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T10:20:00.000Z'));

    const profile = {
      avatarUrl: 'not-a-valid-url',
    } as Parameters<typeof addAvatarCacheBust>[0];

    const result = addAvatarCacheBust(profile);

    expect(result.avatarUrl).toBe('not-a-valid-url');
  });
});
