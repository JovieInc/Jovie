/**
 * Shopify shop link helpers.
 *
 * Phase 1 restricts URLs to *.myshopify.com. Custom domains can be
 * unlocked once we integrate the Shopify Storefront API for validation.
 */

const MYSHOPIFY_PATTERN = /^https:\/\/[a-z0-9-]+\.myshopify\.com(\/.*)?$/i;

/** Maximum reasonable length for a Shopify store URL. */
const MAX_URL_LENGTH = 2048;

/** Returns true when `url` is a valid *.myshopify.com HTTPS URL. */
export function isShopifyDomain(url: string): boolean {
  if (!url || url.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && MYSHOPIFY_PATTERN.test(url);
  } catch {
    return false;
  }
}

/** Read and validate the Shopify URL from the profile settings JSONB. */
export function getShopifyUrl(
  settings: Record<string, unknown> | null | undefined
): string | null {
  if (!settings) return null;
  const raw = settings.shopifyUrl;
  if (typeof raw !== 'string' || !raw) return null;
  return isShopifyDomain(raw) ? raw : null;
}

/** True when the profile has a valid Shopify URL configured. */
export function isShopEnabled(
  settings: Record<string, unknown> | null | undefined
): boolean {
  return getShopifyUrl(settings) !== null;
}

/** Append Jovie UTM attribution params to a Shopify URL. */
export function buildShopRedirectUrl(
  shopifyUrl: string,
  username: string
): string {
  const url = new URL(shopifyUrl);
  url.searchParams.set('utm_source', 'jovie');
  url.searchParams.set('utm_medium', 'profile');
  url.searchParams.set('utm_campaign', 'shop_click');
  url.searchParams.set('utm_content', username);
  return url.toString();
}
