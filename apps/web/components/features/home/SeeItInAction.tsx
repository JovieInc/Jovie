import { FALLBACK_AVATARS } from './featured-creators-fallback';
import { SeeItInActionCarousel } from './SeeItInActionCarousel';

/**
 * Homepage marketing content must stay fully static.
 * Use curated fallback creators only so the page never depends on
 * server-side feature flags or database reads during render.
 */
export function SeeItInAction() {
  return <SeeItInActionCarousel creators={FALLBACK_AVATARS} />;
}
