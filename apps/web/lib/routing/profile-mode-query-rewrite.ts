import { getGatedProfileHandle } from './profile-publication-edge';

/**
 * Modes `/<username>?mode=<mode>` renders on the server. Held equal to
 * `profileQueryModePattern` in next.config.js by its guard test.
 */
export const PROFILE_QUERY_MODES = [
  'listen',
  'pay',
  'subscribe',
  'about',
  'contact',
  'tour',
  'releases',
  'tip',
] as const;

/** Matches PRIVATE_PROFILE_ALIAS_MARKER in proxy.ts and the render route. */
const PROFILE_MODE_ALIAS_MARKER = '__profile-mode-alias';

const PROFILE_QUERY_MODE_SET: ReadonlySet<string> = new Set(
  PROFILE_QUERY_MODES
);

export interface ProfileModeQueryRewriteRequest {
  readonly method: string;
  readonly nextUrl: URL;
}

/**
 * The private mode-render URL for `/<username>?mode=<mode>`, or null.
 *
 * next.config.js already rewrites this query to
 * `/<username>/profile-mode-render/<mode>/__profile-mode-alias`, but as an
 * `afterFiles` rewrite, and Next checks prerendered pages before those. Every
 * profile in the build's static params (the featured set, `/tim` included)
 * therefore served its plain profile document for any `?mode=`, and the
 * client swapped to the requested mode after hydration: the product crawl
 * measured CLS 0.836 on desktop `/tim?mode=listen` and 0.114 on phone for
 * `/tim/notifications` (which 307s to `?mode=subscribe`). The proxy runs
 * before the filesystem, so applying the same rewrite here gives prerendered
 * and on-demand profiles one server-rendered mode document.
 */
export function resolveProfileModeQueryRewrite(
  request: ProfileModeQueryRewriteRequest
): URL | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const { pathname, searchParams } = request.nextUrl;
  if (!getGatedProfileHandle(pathname)) return null;
  const mode = searchParams.get('mode');
  if (mode === null || !PROFILE_QUERY_MODE_SET.has(mode)) return null;

  const segment = pathname.split('/').find(Boolean);
  if (!segment) return null;
  const rewriteUrl = new URL(request.nextUrl.href);
  rewriteUrl.pathname = `/${segment}/profile-mode-render/${mode}/${PROFILE_MODE_ALIAS_MARKER}`;
  return rewriteUrl;
}
