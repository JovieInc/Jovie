import { describe, expect, it, vi } from 'vitest';
import { addAvatarCacheBust } from '@/app/api/dashboard/profile/lib/response';

describe('addAvatarCacheBust', () => {
  it('appends a cache-bust query param to relative avatar URLs', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-16T10:20:00.000Z'));

    const profile = {
      avatarUrl: '/avatars/default-user.png',
    } as Parameters<typeof addAvatarCacheBust>[0];

    const result = addAvatarCacheBust(profile);

    expect(result.avatarUrl).toBe('/avatars/default-user.png?v=1776334800000');

    vi.useRealTimers();
  });
});
