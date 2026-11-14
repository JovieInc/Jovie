import { rmSync } from 'node:fs';
import {
  classifyRoutes,
  evaluateRenderModes,
  SNAPSHOT_SCHEMA,
} from '../route-render-modes.mjs';

export const NOW = new Date('2026-10-22T00:00:00.000Z');
export const roots: string[] = [];
export function cleanupRoots() {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
}

export const page = (htmlSize: number, revalidate: number | false = false) => ({
  routeType: 'page',
  compute: 'static',
  htmlSize,
  initialRevalidateSeconds: revalidate,
});

/** A small build: every render mode, a handler, an intercepted modal. */
export function manifests() {
  return {
    appPathRoutes: {
      '/(home)/page': '/',
      '/(marketing)/pricing/page': '/pricing',
      '/playlists/page': '/playlists',
      '/blog/[slug]/page': '/blog/[slug]',
      '/[username]/page': '/[username]',
      '/start/page': '/start',
      '/app/(shell)/chat/page': '/app/chat',
      '/@auth/(.)signin/page': '/(.)signin',
      '/_not-found/page': '/_not-found',
      '/robots.txt/route': '/robots.txt',
      '/api/health/route': '/api/health',
    } as Record<string, string>,
    prerenderManifest: {
      routes: {
        '/': { ...page(200_000), srcRoute: '/' },
        '/pricing': { ...page(80_000), srcRoute: '/pricing' },
        '/playlists': { ...page(40_000, 300), srcRoute: '/playlists' },
        '/blog/a-post': { ...page(90_000, 600), srcRoute: '/blog/[slug]' },
        '/blog/b-post': { ...page(95_000, 900), srcRoute: '/blog/[slug]' },
        '/_not-found': { ...page(9_000), srcRoute: '/_not-found' },
        '/robots.txt': {
          routeType: 'route',
          initialRevalidateSeconds: false,
          srcRoute: '/robots.txt',
        },
      } as Record<string, Record<string, unknown>>,
      dynamicRoutes: {
        '/blog/[slug]': { fallback: false },
        '/[username]': { fallback: null },
      } as Record<string, Record<string, unknown>>,
    },
  };
}

export const SNAPSHOT_ROUTES = {
  '/': 'static html=200000',
  '/[username]': 'param-prerender',
  '/app/chat': 'dynamic',
  '/blog/[slug]': 'param-prerender:600',
  '/playlists': 'isr:300 html=40000',
  '/pricing': 'static html=80000',
  '/robots.txt': 'static',
  '/start': 'dynamic',
};

export function snapshot(routes: Record<string, string> = SNAPSHOT_ROUTES) {
  return {
    schema: SNAPSHOT_SCHEMA,
    overrides: {} as Record<string, Record<string, string>>,
    routes: { ...routes },
  };
}

export function override(extra: Record<string, string> = {}) {
  return {
    owner: '@jovie',
    reason: 'The page reads a per-request cookie',
    issue: 'JOV-1001',
    removalCondition: 'Move the cookie read behind a client boundary',
    evidence: 'apps/web/scripts/route-render-modes.test.ts',
    ...extra,
  };
}

export function judge(
  mutate: (build: ReturnType<typeof manifests>) => void,
  snap = snapshot(),
  ancestor: ReturnType<typeof snapshot> | null = snap
) {
  const input = manifests();
  mutate(input);
  return evaluateRenderModes({
    build: classifyRoutes(input),
    snapshot: snap,
    ancestor,
    now: NOW,
  });
}
