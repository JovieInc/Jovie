const PRINTFUL_MOCKUP_HOSTS = ['printful.com', 'files.printful.com'] as const;

const INTERNAL_MOCKUP_PATH = '/merch/generated/';
const COMPOSITED_MOCKUP_SUFFIX = /-mockup\.(?:jpe?g|webp)(?:[?#].*)?$/i;

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

export function isCompositedMerchMockupUrl(url: string): boolean {
  try {
    return COMPOSITED_MOCKUP_SUFFIX.test(new URL(url).pathname);
  } catch {
    return url.includes('-mockup.jpg') || url.includes('-mockup.jpeg');
  }
}

export function isInternalMerchMockupUrl(url: string): boolean {
  return isCompositedMerchMockupUrl(url) || url.includes(INTERNAL_MOCKUP_PATH);
}

/**
 * A garment mockup the UI may present as a finished product shot.
 * Raw print-art PNGs are not finished garments.
 */
export function hasFinishedGarmentMockup(urls: readonly string[]): boolean {
  return urls.some(
    url => isPrintfulMockupUrl(url) || isCompositedMerchMockupUrl(url)
  );
}

/**
 * Prefer photorealistic Printful mockups, then internal composited garments.
 * Never treat a print-file PNG as a finished mockup.
 */
export function selectPreferredMockupUrl(
  urls: readonly string[]
): string | null {
  const printfulUrl = urls.find(isPrintfulMockupUrl);
  if (printfulUrl) return printfulUrl;

  const compositedUrl = urls.find(isCompositedMerchMockupUrl);
  if (compositedUrl) return compositedUrl;

  return null;
}

export function hasRenderableMockup(urls: readonly string[]): boolean {
  return selectPreferredMockupUrl(urls) !== null;
}
