import { APP_ROUTES } from '@/constants/routes';

/**
 * Editorial content routes (blog, changelog releases, engineering — minus
 * the founder-only preview gallery) render their own bottom-of-page
 * conversion element: `MarketingEmailSignup`'s product-update subscribe box.
 *
 * `MarketingFooter` must not additionally stack its generic request-access
 * `MarketingFooterCta` on top of that — the marketing routes spec (Tim,
 * 2026-09-26) requires exactly one footer CTA per page. Keep this predicate
 * as the single source both components read, so they can never drift.
 */
export function isEditorialFooterCtaPath(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.BLOG ||
    pathname.startsWith(`${APP_ROUTES.BLOG}/`) ||
    pathname === APP_ROUTES.ENGINEERING ||
    (pathname.startsWith(`${APP_ROUTES.ENGINEERING}/`) &&
      !pathname.startsWith(APP_ROUTES.ENGINEERING_PREVIEW)) ||
    pathname.startsWith(`${APP_ROUTES.CHANGELOG}/`)
  );
}
