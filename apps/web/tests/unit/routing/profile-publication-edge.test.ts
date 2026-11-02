import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProfileMode } from '@/components/features/profile/registry';
import {
  gateProfilePublicationAtEdge,
  getGatedProfileHandle,
  type ProfilePublicationGateRequest,
} from '@/lib/routing/profile-publication-edge';

const readPublished = vi.fn<(handle: string) => Promise<boolean>>();

const GATE_ORIGIN = 'https://jov.ie';

function gateRequest(
  path: string,
  method = 'GET'
): ProfilePublicationGateRequest {
  return { method, nextUrl: new URL(GATE_ORIGIN + path) };
}

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
      await gateProfilePublicationAtEdge(gateRequest('/DuaLipa'), readPublished)
    ).toBeNull();
    expect(readPublished).toHaveBeenCalledExactlyOnceWith('dualipa');
  });

  it('rewrites withdrawn, deleted and renamed-away handles into the branded profile 404', async () => {
    readPublished.mockResolvedValueOnce(false);
    const response = await gateProfilePublicationAtEdge(
      gateRequest('/dualipa'),
      readPublished
    );
    // JOV-10267: navigation requests must get the branded
    // app/[username]/not-found.tsx render — rewritten into the marker-guarded
    // private destination — never a bare body and never the ISR-cached
    // profile body.
    expect(response?.headers.get('x-middleware-rewrite')).toBe(
      'https://jov.ie/dualipa/profile-mode-render/__profile-miss/__profile-mode-alias'
    );
    expect(response?.headers.get('cache-control')).toContain('no-store');
  });

  it('keeps a bare 404 for non-navigation methods so no cached body can leak', async () => {
    readPublished.mockResolvedValueOnce(false);
    const response = await gateProfilePublicationAtEdge(
      gateRequest('/dualipa', 'POST'),
      readPublished
    );
    expect(response?.status).toBe(404);
    expect(response?.headers.get('cache-control')).toContain('no-store');
    expect(await response?.text()).toBe('Not Found');
  });

  it('fails closed with 503 when the storage read fails or times out', async () => {
    readPublished.mockRejectedValueOnce(new Error('timeout'));
    const response = await gateProfilePublicationAtEdge(
      gateRequest('/dualipa'),
      readPublished
    );
    expect(response?.status).toBe(503);
    expect(response?.headers.get('cache-control')).toContain('no-store');
  });

  it('never reads storage for real routes', async () => {
    expect(
      await gateProfilePublicationAtEdge(gateRequest('/start'), readPublished)
    ).toBeNull();
    expect(readPublished).not.toHaveBeenCalled();
  });
});

describe('branded miss destination', () => {
  // The rewrite target 404s into app/[username]/not-found.tsx only while the
  // miss sentinel resolves to no profile mode. If a mode with this segment
  // name is ever registered, the destination would start rendering a profile
  // body for gated handles instead — this pin makes that regression loud.
  it('resolves the miss sentinel to no profile mode', () => {
    expect(getProfileMode('__profile-miss')).toBe('profile');
  });
});

describe('fixture handles', () => {
  it('skips the gate for fixture handles on a managed fixture runtime', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '1');
    vi.stubEnv('VERCEL_ENV', '');
    for (const path of ['/unfazed', '/Unfazed', '/jovie-screen-fixture']) {
      expect(
        await gateProfilePublicationAtEdge(gateRequest(path), readPublished)
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
      const res = await gateProfilePublicationAtEdge(
        gateRequest(path),
        readPublished
      );
      expect(readPublished).toHaveBeenCalledTimes(1);
      expect(res?.headers.get('x-middleware-rewrite')).toBe(
        `${GATE_ORIGIN}${path}/profile-mode-render/__profile-miss/__profile-mode-alias`
      );
    }
  );

  it('still gates fixture handles when no fixture runtime flag is set', async () => {
    vi.stubEnv('PUBLIC_NOAUTH_SMOKE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    readPublished.mockResolvedValueOnce(false);
    const res = await gateProfilePublicationAtEdge(
      gateRequest('/unfazed'),
      readPublished
    );
    expect(res?.headers.get('x-middleware-rewrite')).toBe(
      `${GATE_ORIGIN}/unfazed/profile-mode-render/__profile-miss/__profile-mode-alias`
    );
  });
});
