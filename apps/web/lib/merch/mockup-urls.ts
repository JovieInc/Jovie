const PRINTFUL_MOCKUP_HOSTS = ['printful.com', 'files.printful.com'] as const;

const INTERNAL_MOCKUP_PATH = '/merch/generated/';

export function isPrintfulMockupUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return PRINTFUL_MOCKUP_HOSTS.some(
      host => hostname === host || hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

export function isInternalMerchMockupUrl(url: string): boolean {
  return url.includes(INTERNAL_MOCKUP_PATH) || url.includes('-mockup.jpg');
}

/**
 * Prefer photorealistic Printful mockups over internal composited placeholders.
 */
export function selectPreferredMockupUrl(
  urls: readonly string[]
): string | null {
  if (urls.length === 0) return null;

  const printfulUrl = urls.find(isPrintfulMockupUrl);
  if (printfulUrl) return printfulUrl;

  return urls[0] ?? null;
}

export function hasRenderableMockup(urls: readonly string[]): boolean {
  return selectPreferredMockupUrl(urls) !== null;
}
