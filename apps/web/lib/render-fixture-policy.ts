import type { Metadata } from 'next';
import { isProfileAdmissionFixtureEnabled } from '@/app/(marketing)/renders/profile-admission/guard';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

/**
 * Render-fixture route contract — the single source for Jovie's internal
 * screenshot/QA fixture surface.
 *
 * Two authorization modes exist:
 * - `e2e-env`: `/renders*` pages admit only the managed fixture runtime
 *   (delegated to the profile-admission guard). Production and requests with
 *   missing or invalid fixture authorization must not render fixture HTML.
 * - `private-marker`: `/{username}/profile-mode-render/{profileMode}/{marker}`
 *   is the internal rewrite destination for bounded `?mode=` aliases. The proxy
 *   drops direct requests carrying the marker, so only afterFiles rewrites
 *   reach it; the page additionally 404s any non-marker value.
 */
export type RenderFixtureEnv = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | 'CI'
    | 'NEXT_PUBLIC_E2E_MODE'
    | 'NODE_ENV'
    | 'PUBLIC_NOAUTH_SMOKE'
    | 'VERCEL_ENV'
  >
>;

/** Private marker segment appended by the bounded `?mode=` rewrite. */
export const PROFILE_MODE_ALIAS_MARKER = '__profile-mode-alias';

/** URL globs that make up the render-fixture surface. */
export const RENDER_FIXTURE_ROUTE_GLOBS = [
  '/renders',
  '/renders/[state]',
  '/renders/profile-admission',
  '/renders/surfaces/[surface]',
  '/{username}/profile-mode-render/{profileMode}/{marker}',
] as const;

export type RenderFixtureRouteGlob =
  (typeof RENDER_FIXTURE_ROUTE_GLOBS)[number];

export type RenderFixtureAdmission = 'e2e-env' | 'private-marker';

/** Each fixture route declares exactly one admission primitive. */
export const RENDER_FIXTURE_ADMISSION: Readonly<
  Record<RenderFixtureRouteGlob, RenderFixtureAdmission>
> = {
  '/renders': 'e2e-env',
  '/renders/[state]': 'e2e-env',
  '/renders/profile-admission': 'e2e-env',
  '/renders/surfaces/[surface]': 'e2e-env',
  '/{username}/profile-mode-render/{profileMode}/{marker}': 'private-marker',
};

/**
 * Classifier for the fixture surface. Sitemap, route manifest, and capture
 * tooling share this so a fixture path can never be indexable by accident.
 */
export function isRenderFixturePathname(pathname: string): boolean {
  if (pathname === '/renders' || pathname.startsWith('/renders/')) {
    return true;
  }
  const segments = pathname.split('/').filter(Boolean);
  return segments.length === 4 && segments[1] === 'profile-mode-render';
}

/** Marker authorization for the internal profile-mode render destination. */
export function isProfileModeAliasMarker(marker: string): boolean {
  return marker === PROFILE_MODE_ALIAS_MARKER;
}

/**
 * Fixture authorization for the `/renders*` pages — delegated to the shared
 * profile-admission guard so every fixture page admits identically.
 */
export function isRenderFixtureEnabled(env?: RenderFixtureEnv): boolean {
  return isProfileAdmissionFixtureEnabled(env);
}

/** Non-indexable metadata for authorized fixture responses. */
export const RENDER_FIXTURE_METADATA: Metadata = { robots: NOINDEX_ROBOTS };

/**
 * X-Robots-Tag value emitted for fixture routes. next.config.js is plain
 * JavaScript and cannot import this module — the contract test pins parity.
 */
export const RENDER_FIXTURE_X_ROBOTS_TAG = 'noindex, nofollow';
