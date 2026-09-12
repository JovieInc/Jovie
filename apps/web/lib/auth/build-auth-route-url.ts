import { APP_ROUTES } from '@/constants/routes';
import { validateBillingInterval } from '@/lib/billing/offer-truth';

import { sanitizeRedirectUrl } from './constants';
import { validatePlan } from './plan-intent';

/**
 * Default post-auth destination for sign-up flows when no redirect_url is set.
 */
export function getDefaultSignUpFallbackRedirectUrl(): string {
  return APP_ROUTES.START;
}

interface SearchParamReader {
  get(key: string): string | null;
}

export function applyPreservedAuthOfferParams(
  routeUrl: URL,
  searchParams: SearchParamReader
): void {
  const plan = validatePlan(searchParams.get('plan'));
  if (plan) {
    routeUrl.searchParams.set('plan', plan);
  }

  const interval = validateBillingInterval(searchParams.get('interval'));
  if (plan && plan !== 'free' && interval) {
    routeUrl.searchParams.set('interval', interval);
  }

  const handle = searchParams.get('handle')?.trim() ?? '';
  if (/^[a-zA-Z0-9._-]{2,32}$/.test(handle)) {
    routeUrl.searchParams.set('handle', handle);
  }
}

/**
 * Builds a cross-link between auth routes while forwarding the sanitized
 * `redirect_url` plus validated plan/interval/handle offer params.
 */
export function buildAuthRouteUrl(
  pathname: string,
  searchParams: SearchParamReader
): string {
  const routeUrl = new URL(pathname, 'https://n');
  const redirectUrl = sanitizeRedirectUrl(searchParams.get('redirect_url'));

  if (redirectUrl) {
    routeUrl.searchParams.set('redirect_url', redirectUrl);
  }

  applyPreservedAuthOfferParams(routeUrl, searchParams);

  return routeUrl.pathname + routeUrl.search;
}

/**
 * Builds an auth route for protected-path redirects while preserving the
 * current in-app pathname and search params as a sanitized redirect target.
 */
export function buildProtectedAuthRedirectUrl(
  pathname: string,
  requestedPathname: string,
  requestedSearch = ''
): string {
  const routeUrl = new URL(pathname, 'https://n');
  const redirectUrl =
    sanitizeRedirectUrl(`${requestedPathname}${requestedSearch}`) ??
    sanitizeRedirectUrl(requestedPathname);

  if (redirectUrl) {
    routeUrl.searchParams.set('redirect_url', redirectUrl);
  }

  return routeUrl.pathname + routeUrl.search;
}
