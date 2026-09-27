import { APP_ROUTES } from '@/constants/routes';

/**
 * How the marketing header presents the brand.
 * - `lockup`: mark + "Jovie" wordmark (desktop nav carries the wordmark).
 * - `icon`: mark only. Hover/focus spins the mark and slides the wordmark
 *   out (LogoLink `reveal`).
 */
export type MarketingHeaderBrand = 'lockup' | 'icon';

/**
 * Pages whose hero H1 already says "Jovie" render the header icon-only
 * (Tim direction 2026-09-26): the headline carries the name, so the header
 * does not repeat it. This is explicit per-page config, not DOM sniffing.
 * `tests/unit/marketing/header-brand-config.test.ts` keeps the list in sync
 * with the hero copy sources.
 */
export const MARKETING_HEADER_ICON_ONLY_PATHS: readonly string[] = [
  APP_ROUTES.AI,
  APP_ROUTES.CARD,
  APP_ROUTES.DOWNLOAD,
  `${APP_ROUTES.COMPARE}/linkfire`,
  `${APP_ROUTES.COMPARE}/linktree`,
];

/** True when a hero headline names the brand as a whole word. */
export function headlineNamesBrand(headline: string): boolean {
  return /\bJovie\b/.test(headline);
}

export function resolveMarketingHeaderBrand(
  pathname: string | null,
  override?: MarketingHeaderBrand
): MarketingHeaderBrand {
  if (override) return override;
  if (pathname === null) return 'lockup';
  return MARKETING_HEADER_ICON_ONLY_PATHS.includes(pathname)
    ? 'icon'
    : 'lockup';
}
