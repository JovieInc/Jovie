import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  gateProfilePublicationAtEdge,
  getGatedProfileHandle,
} from '@/lib/routing/profile-publication-edge';

const ORIGIN = 'https://jov.ie';
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const decision = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status })
  );

describe('profile publication gate scope', () => {
  it.each(['/dualipa', '/DuaLipa', '/dj.snake', '/dua%6Cipa'])(
    'gates the profile document %s',
    path => expect(getGatedProfileHandle(path)).not.toBeNull()
  );

  it.each([
    '/',
    '/start',
    '/claim',
    '/billing',
    '/pricing',
    '/robots.txt',
    '/sitemap.xml',
    '/favicon.ico',
    '/admin',
    '/ab',
    '/dualipa/listen',
    '/dualipa/tour',
    '/%E0%A4%A',
  ])('never gates %s', path => {
    expect(getGatedProfileHandle(path)).toBeNull();
  });
});

describe('profile publication gate decisions', () => {
  it('serves the cached body only when the handle is published now', async () => {
    decision({ published: true });
    expect(
      await gateProfilePublicationAtEdge('/DuaLipa', ORIGIN, 'a=b')
    ).toBeNull();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      'https://jov.ie/api/profile-publication?username=dualipa'
    );
    expect(init).toMatchObject({
      cache: 'no-store',
      headers: { cookie: 'a=b' },
    });
  });

  it('404s withdrawn, deleted and renamed-away handles without the body', async () => {
    decision({ published: false });
    const response = await gateProfilePublicationAtEdge(
      '/dualipa',
      ORIGIN,
      null
    );
    expect(response?.status).toBe(404);
    expect(response?.headers.get('cache-control')).toContain('no-store');
  });

  it.each([
    ['a 503 decision', () => decision({ error: 'unavailable' }, 503)],
    ['a malformed decision', () => decision({ published: 'yes' })],
    [
      'a network failure',
      () => fetchMock.mockRejectedValueOnce(new Error('x')),
    ],
  ])('fails closed with 503 on %s', async (_label, arrange) => {
    arrange();
    const response = await gateProfilePublicationAtEdge(
      '/dualipa',
      ORIGIN,
      null
    );
    expect(response?.status).toBe(503);
    expect(response?.headers.get('cache-control')).toContain('no-store');
  });

  it('does not call the decision endpoint for real routes', async () => {
    expect(
      await gateProfilePublicationAtEdge('/start', ORIGIN, null)
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
