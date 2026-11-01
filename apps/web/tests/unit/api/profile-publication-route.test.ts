import { beforeEach, describe, expect, it, vi } from 'vitest';

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: limitMock }) }) }),
  },
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '@/app/api/profile-publication/route';

const call = (username: string) =>
  GET(
    new Request(
      `https://jov.ie/api/profile-publication?username=${encodeURIComponent(username)}`
    )
  );

beforeEach(() => limitMock.mockReset());

describe('GET /api/profile-publication', () => {
  it.each([
    [[{ isPublic: true }], true],
    [[{ isPublic: 't' }], true],
    [[{ isPublic: false }], false],
    [[{ isPublic: null }], false],
    [[], false],
  ])('reads publication fresh: %j -> %s', async (rows, published) => {
    limitMock.mockResolvedValueOnce(rows);
    const response = await call('DuaLipa');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ published });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('returns an uncacheable 503 when storage fails', async () => {
    limitMock.mockRejectedValueOnce(new Error('neon down'));
    const response = await call('dualipa');
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects non-profile handles without reading storage', async () => {
    const response = await call('start');
    expect(response.status).toBe(400);
    expect(limitMock).not.toHaveBeenCalled();
  });
});
