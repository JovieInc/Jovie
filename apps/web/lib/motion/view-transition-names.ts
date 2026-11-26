/**
 * Stable ViewTransition names for route-persistent surfaces (JOV-14244).
 * Keep names short and unique per artist / release so React can morph pairs.
 * Reduced motion: prefers-reduced-motion kills ::view-transition-* in globals.css.
 */

export function artistAvatarTransitionName(handle: string): string {
  return `artist-avatar-${handle}`;
}

export function artistTitleTransitionName(handle: string): string {
  return `artist-title-${handle}`;
}

export function releaseCoverTransitionName(slug: string): string {
  return `release-cover-${slug}`;
}

export function releaseTitleTransitionName(slug: string): string {
  return `release-title-${slug}`;
}

/** Marketing / public shell header: suppress motion so content moves around it. */
export const SITE_HEADER_TRANSITION_NAME = 'site-header';
