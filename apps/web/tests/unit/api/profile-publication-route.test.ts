import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readMock } = vi.hoisted(() => ({ readMock: vi.fn() }));
vi.mock('@/lib/profile/publication-read', () => ({
  readProfilePublished: readMock,
}));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '@/app/api/profile-publication/route';

const call = (username: string) =>
  GET(
    new Request(
      `https://jov.ie/api/profile-publication?username=${encodeURIComponent(username)}`
    )
  );

beforeEach(() => readMock.mockReset());

describe('GET /api/profile-publication', () => {
  it.each([true, false])('reports the fresh decision %s', async published => {
    readMock.mockResolvedValueOnce(published);
    const response = await call('DuaLipa');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ published });
    expect(readMock).toHaveBeenCalledWith('dualipa');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('returns an uncacheable 503 when storage fails', async () => {
    readMock.mockRejectedValueOnce(new Error('neon down'));
    const response = await call('dualipa');
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects non-profile handles without reading storage', async () => {
    const response = await call('start');
    expect(response.status).toBe(400);
    expect(readMock).not.toHaveBeenCalled();
  });
});
