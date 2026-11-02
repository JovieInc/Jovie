import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  gateProfilePublicationAtEdge,
  getGatedProfileHandle,
} from '@/lib/routing/profile-publication-edge';

const readPublished = vi.fn<(handle: string) => Promise<boolean>>();

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  readPublished.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

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
  it('serves the cached body only when storage says the handle is published now', async () => {
    readPublished.mockResolvedValueOnce(true);
    expect(
      await gateProfilePublicationAtEdge('/DuaLipa', readPublished)
    ).toBeNull();
    expect(readPublished).toHaveBeenCalledExactlyOnceWith('dualipa');
  });

  it('404s withdrawn, deleted and renamed-away handles without the body', async () => {
    readPublished.mockResolvedValueOnce(false);
    const response = await gateProfilePublicationAtEdge(
      '/dualipa',
      readPublished
    );
    expect(response?.status).toBe(404);
    expect(response?.headers.get('cache-control')).toContain('no-store');
  });

  it('fails closed with 503 when the storage read fails or times out', async () => {
    readPublished.mockRejectedValueOnce(new Error('timeout'));
    const response = await gateProfilePublicationAtEdge(
      '/dualipa',
      readPublished
    );
    expect(response?.status).toBe(503);
    expect(response?.headers.get('cache-control')).toContain('no-store');
  });

  it('never reads storage for real routes', async () => {
    expect(
      await gateProfilePublicationAtEdge('/start', readPublished)
    ).toBeNull();
    expect(readPublished).not.toHaveBeenCalled();
  });
});

describe('fixture handles', () => {
  it('skips the gate for fixture handles on a managed fixture runtime', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    for (const path of ['/unfazed', '/Unfazed', '/jovie-screen-fixture']) {
      expect(
        await gateProfilePublicationAtEdge(path, readPublished)
      ).toBeNull();
    }
    expect(readPublished).not.toHaveBeenCalled();
  });

  it.each(['/unfazed', '/jovie-screen-fixture'])(
    'still gates a DB-backed profile at %s in production',
    async path => {
      vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
      vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
      vi.stubEnv('VERCEL_ENV', 'production');
      readPublished.mockResolvedValueOnce(false);
      const res = await gateProfilePublicationAtEdge(path, readPublished);
      expect(readPublished).toHaveBeenCalledTimes(1);
      expect(res?.status).toBe(404);
    }
  );

  it('still gates fixture handles when no fixture runtime flag is set', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    readPublished.mockResolvedValueOnce(false);
    const res = await gateProfilePublicationAtEdge('/unfazed', readPublished);
    expect(res?.status).toBe(404);
  });
});
