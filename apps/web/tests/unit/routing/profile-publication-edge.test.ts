import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  gateProfilePublicationAtEdge,
  getGatedProfileHandle,
  getProfileModeQueryRewrite,
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
      'https://jov.ie/dualipa/profile-miss'
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
  // The rewrite target is the dedicated dynamic profile-miss route, which
  // renders the branded boundary server-side. If it ever moved back onto
  // the prerendered mode-render route, the miss would degrade into Next's
  // flight-only __next_error__ shell again — this pin makes that loud.
  it('rewrites the miss into the dynamic profile-miss route', () => {
    const source = readFileSync(
      resolve(
        import.meta.dirname,
        '../../../lib/routing/profile-publication-edge.ts'
      ),
      'utf8'
    );
    expect(source).toContain("PROFILE_MISS_REWRITE_SEGMENTS = 'profile-miss'");
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
        `${GATE_ORIGIN}${path}/profile-miss`
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
      `${GATE_ORIGIN}/unfazed/profile-miss`
    );
  });
});

describe('profile mode query rewrite (JOV-12081)', () => {
  // The rewrite is bounded to the (handle, mode) pairs the mode-render route
  // prerenders (aliasBudgetProfileModeParams): the route's ISR fallback render
  // for a handle the build did not prerender serves a 404, not the profile
  // (JOV-12481 — a freshly claimed, published, exempt profile 404'd for the
  // full 180 s Golden Path poll on run 43433399178). Every other handle keeps
  // the canonical render.
  it.each(['listen', 'subscribe', 'releases', 'tour'])(
    'rewrites the prerendered dualipa mode query %s to the guarded marker destination',
    mode => {
      const rewrite = getProfileModeQueryRewrite(
        gateRequest(`/dualipa?mode=${mode}`)
      );
      expect(rewrite?.headers.get('x-middleware-rewrite')).toBe(
        `${GATE_ORIGIN}/dualipa/profile-mode-render/${mode}/__profile-mode-alias`
      );
    }
  );

  it('rewrites the prerendered testartist pay alias', () => {
    const rewrite = getProfileModeQueryRewrite(
      gateRequest('/testartist?mode=pay')
    );
    expect(rewrite?.headers.get('x-middleware-rewrite')).toBe(
      `${GATE_ORIGIN}/testartist/profile-mode-render/pay/__profile-mode-alias`
    );
  });

  it.each(['pay', 'about', 'contact', 'tip'])(
    'keeps dualipa %s on the canonical render: no mode document is prerendered for that pair',
    mode => {
      expect(
        getProfileModeQueryRewrite(gateRequest(`/dualipa?mode=${mode}`))
      ).toBeNull();
    }
  );

  it('never sends a freshly claimed handle into the mode-render fallback (JOV-12481)', () => {
    expect(
      getProfileModeQueryRewrite(gateRequest('/tmwf0e76ofc781?mode=listen'))
    ).toBeNull();
  });

  it('lowercases the handle and keeps the request a rewrite, not a redirect', () => {
    const rewrite = getProfileModeQueryRewrite(
      gateRequest('/DuaLipa?mode=listen')
    );
    expect(rewrite?.headers.get('x-middleware-rewrite')).toBe(
      `${GATE_ORIGIN}/dualipa/profile-mode-render/listen/__profile-mode-alias`
    );
    expect(rewrite?.status).toBe(200);
  });

  it.each([
    '/dualipa?mode=profile',
    '/dualipa?mode=music',
    '/dualipa?mode=listen%2F..%2F..%2Fapp',
    '/pricing?mode=listen',
    '/signin?mode=listen',
    '/dualipa/listen?mode=pay',
    '/dualipa?mode=',
  ])('never rewrites %s', path => {
    expect(getProfileModeQueryRewrite(gateRequest(path))).toBeNull();
  });

  it('never rewrites non-navigation methods', () => {
    expect(
      getProfileModeQueryRewrite(gateRequest('/dualipa?mode=listen', 'POST'))
    ).toBeNull();
  });
});
