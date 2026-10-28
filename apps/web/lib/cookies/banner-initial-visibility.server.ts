import { cookies, headers } from 'next/headers';
import {
  COOKIE_BANNER_REQUIRED_COOKIE,
  isCookieBannerRequired,
} from '@/lib/cookies/consent-regions';
import { CONSENT_COOKIE_NAME } from '@/lib/cookies/consent-state';

/**
 * Whether the cookie card should be in the first HTML of a dynamic page.
 *
 * The card is the largest text on thin pages such as `/claim`, so painting it
 * only after hydration made it the LCP element at ~4.5s on the throttled-mobile
 * entry gate (budget 4000ms). A page that opts in renders `CookieBannerSection`
 * with this value as `initialVisible` so the card paints with the HTML.
 *
 * Mirrors the proxy: the visitor's geo decides whether consent is required and a
 * saved consent cookie hides the card. Dynamic pages only; it reads request
 * state, so never call it from an ISR page or the root layout.
 */
export async function resolveInitialCookieBannerVisible(): Promise<boolean> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  if (cookieStore.get(CONSENT_COOKIE_NAME)?.value) return false;

  const country =
    headerStore.get('x-vercel-ip-country') ?? headerStore.get('cf-ipcountry');
  if (country) {
    return isCookieBannerRequired(
      country.trim().toUpperCase(),
      headerStore.get('x-vercel-ip-country-region')?.trim() ?? null
    );
  }
  // No geo header (local dev, previews): fall back to the proxy's cookie.
  return cookieStore.get(COOKIE_BANNER_REQUIRED_COOKIE)?.value === '1';
}
