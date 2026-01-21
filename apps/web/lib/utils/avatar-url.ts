/**
 * Utility functions for upgrading OAuth provider avatar URLs to higher resolutions.
 *
 * OAuth providers often return low-resolution profile photos by default.
 * This module provides functions to request higher quality versions.
 */

/**
 * Target size for high-resolution avatars.
 * 512px is a good balance between quality and file size.
 */
const HIGH_RES_SIZE = 512;

/**
 * Upgrade a Google profile photo URL to request a higher resolution.
 *
 * Google profile photos use googleusercontent.com and support size parameters:
 * - `=s96-c` means 96x96 cropped square
 * - `=s400-c` means 400x400 cropped square
 * - Remove the parameter entirely to get the original size
 *
 * @example
 * // Input: https://lh3.googleusercontent.com/a/xxx=s96-c
 * // Output: https://lh3.googleusercontent.com/a/xxx=s512-c
 */
function upgradeGoogleAvatarUrl(url: string): string {
  // Match Google's size parameter pattern: =s{number} or =s{number}-c
  // The -c suffix means "cropped to square"
  const sizePattern = /=s\d+(-c)?$/;

  if (sizePattern.test(url)) {
    // Replace existing size with high-res version
    return url.replace(sizePattern, `=s${HIGH_RES_SIZE}-c`);
  }

  // If no size parameter, append one
  // Check if URL already has query params
  if (url.includes('?')) {
    return url;
  }

  return `${url}=s${HIGH_RES_SIZE}-c`;
}

/**
 * Upgrade a Facebook/Meta profile photo URL to request a higher resolution.
 *
 * Facebook URLs may contain dimension parameters like:
 * - `width=96&height=96`
 * - `/s96x96/` in the path
 *
 * @example
 * // Input: https://platform-lookaside.fbsbx.com/.../s96x96/xxx.jpg
 * // Output: https://platform-lookaside.fbsbx.com/.../s512x512/xxx.jpg
 */
function upgradeFacebookAvatarUrl(url: string): string {
  // Replace path-based dimensions like /s96x96/
  const pathSizePattern = /\/s\d+x\d+\//;
  if (pathSizePattern.test(url)) {
    return url.replace(pathSizePattern, `/s${HIGH_RES_SIZE}x${HIGH_RES_SIZE}/`);
  }

  // Replace query param dimensions
  try {
    const urlObj = new URL(url);
    const width = urlObj.searchParams.get('width');
    const height = urlObj.searchParams.get('height');

    if (width || height) {
      urlObj.searchParams.set('width', String(HIGH_RES_SIZE));
      urlObj.searchParams.set('height', String(HIGH_RES_SIZE));
      return urlObj.toString();
    }
  } catch {
    // Invalid URL, return as-is
  }

  return url;
}

/**
 * Upgrade a Twitter/X profile photo URL to request a higher resolution.
 *
 * Twitter uses suffixes to indicate size:
 * - `_normal` = 48x48
 * - `_bigger` = 73x73
 * - `_200x200` = 200x200
 * - `_400x400` = 400x400
 * - No suffix = original size
 *
 * @example
 * // Input: https://pbs.twimg.com/profile_images/xxx_normal.jpg
 * // Output: https://pbs.twimg.com/profile_images/xxx_400x400.jpg
 */
function upgradeTwitterAvatarUrl(url: string): string {
  // Replace size suffixes with 400x400 (Twitter's max)
  const sizePattern = /_(normal|bigger|200x200|400x400)(\.[a-z]+)$/i;

  if (sizePattern.test(url)) {
    return url.replace(sizePattern, '_400x400$2');
  }

  // If no size suffix, try to add one before the extension
  const extPattern = /(\.[a-z]+)$/i;
  if (extPattern.test(url) && !url.includes('_400x400')) {
    return url.replace(extPattern, '_400x400$1');
  }

  return url;
}

/**
 * Upgrade a GitHub avatar URL to request a higher resolution.
 *
 * GitHub avatars support size via query parameter:
 * - `?s=96` or `?size=96` for 96x96
 * - Default without param is 420x420
 *
 * @example
 * // Input: https://avatars.githubusercontent.com/u/xxx?s=96
 * // Output: https://avatars.githubusercontent.com/u/xxx?s=512
 */
function upgradeGitHubAvatarUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // GitHub uses 's' or 'size' parameter
    if (urlObj.searchParams.has('s')) {
      urlObj.searchParams.set('s', String(HIGH_RES_SIZE));
      return urlObj.toString();
    }

    if (urlObj.searchParams.has('size')) {
      urlObj.searchParams.set('size', String(HIGH_RES_SIZE));
      return urlObj.toString();
    }

    // Add size parameter if none exists
    urlObj.searchParams.set('s', String(HIGH_RES_SIZE));
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Upgrade a Clerk-hosted image URL to request a higher resolution.
 *
 * Clerk may proxy OAuth images through their CDN:
 * - img.clerk.com
 * - images.clerk.dev
 *
 * These may contain width/height params or Imgix-style parameters.
 */
function upgradeClerkAvatarUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    // Clerk uses Imgix-style parameters: w, h, width, height
    const widthParams = ['w', 'width'];
    const heightParams = ['h', 'height'];

    let modified = false;

    for (const param of widthParams) {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, String(HIGH_RES_SIZE));
        modified = true;
      }
    }

    for (const param of heightParams) {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, String(HIGH_RES_SIZE));
        modified = true;
      }
    }

    if (modified) {
      return urlObj.toString();
    }

    // If no size params, return as-is (might be full resolution already)
    return url;
  } catch {
    return url;
  }
}

/**
 * Upgrade a Gravatar URL to request a higher resolution.
 *
 * Gravatar uses 's' or 'size' query parameter:
 * - Default is 80x80
 * - Max is 2048x2048
 *
 * @example
 * // Input: https://www.gravatar.com/avatar/xxx?s=80
 * // Output: https://www.gravatar.com/avatar/xxx?s=512
 */
function upgradeGravatarUrl(url: string): string {
  try {
    const urlObj = new URL(url);

    if (urlObj.searchParams.has('s')) {
      urlObj.searchParams.set('s', String(HIGH_RES_SIZE));
      return urlObj.toString();
    }

    if (urlObj.searchParams.has('size')) {
      urlObj.searchParams.set('size', String(HIGH_RES_SIZE));
      return urlObj.toString();
    }

    // Add size parameter
    urlObj.searchParams.set('s', String(HIGH_RES_SIZE));
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Provider keys for avatar URL upgrade functions.
 */
type AvatarProvider =
  | 'google'
  | 'facebook'
  | 'twitter'
  | 'github'
  | 'clerk'
  | 'gravatar';

/**
 * Map of provider keys to their upgrade functions.
 */
const PROVIDER_UPGRADE_MAP: Record<AvatarProvider, (url: string) => string> = {
  google: upgradeGoogleAvatarUrl,
  facebook: upgradeFacebookAvatarUrl,
  twitter: upgradeTwitterAvatarUrl,
  github: upgradeGitHubAvatarUrl,
  clerk: upgradeClerkAvatarUrl,
  gravatar: upgradeGravatarUrl,
};

/**
 * Detect the provider key from a hostname using exact domain matching.
 *
 * Security: Uses exact domain matching to prevent subdomain injection attacks.
 * For example, "evil.fbsbx.com.attacker.com" will NOT match "fbsbx.com".
 */
function detectProviderKey(hostname: string): AvatarProvider | null {
  const lowerHostname = hostname.toLowerCase();

  // Google: exact domain or subdomain match only
  if (
    lowerHostname === 'googleusercontent.com' ||
    lowerHostname.endsWith('.googleusercontent.com')
  ) {
    return 'google';
  }

  // Facebook: exact domain or subdomain matches only
  if (
    lowerHostname === 'fbsbx.com' ||
    lowerHostname.endsWith('.fbsbx.com') ||
    lowerHostname === 'fbcdn.net' ||
    lowerHostname.endsWith('.fbcdn.net') ||
    lowerHostname === 'facebook.com' ||
    lowerHostname.endsWith('.facebook.com')
  ) {
    return 'facebook';
  }

  // Twitter: exact match only (no subdomains)
  if (lowerHostname === 'pbs.twimg.com') {
    return 'twitter';
  }

  // GitHub: exact match only (no subdomains)
  if (lowerHostname === 'avatars.githubusercontent.com') {
    return 'github';
  }

  // Clerk: exact matches only (no subdomains)
  if (
    lowerHostname === 'img.clerk.com' ||
    lowerHostname === 'images.clerk.dev'
  ) {
    return 'clerk';
  }

  // Gravatar: exact domain or subdomain match only
  if (
    lowerHostname === 'gravatar.com' ||
    lowerHostname.endsWith('.gravatar.com')
  ) {
    return 'gravatar';
  }

  return null;
}

/**
 * Check if a provider key is valid (for use in isUpgradeableAvatarUrl).
 */
function isKnownProvider(hostname: string): boolean {
  return detectProviderKey(hostname) !== null;
}

/**
 * Detect the OAuth provider from an avatar URL and upgrade it to high resolution.
 *
 * Supports:
 * - Google (lh3.googleusercontent.com, *.googleusercontent.com)
 * - Facebook/Meta (platform-lookaside.fbsbx.com, *.fbcdn.net, graph.facebook.com)
 * - Twitter/X (pbs.twimg.com)
 * - GitHub (avatars.githubusercontent.com)
 * - Clerk CDN (img.clerk.com, images.clerk.dev)
 * - Gravatar (gravatar.com, secure.gravatar.com)
 *
 * @param url - The original avatar URL from the OAuth provider
 * @returns The URL modified to request a higher resolution image
 */
export function upgradeOAuthAvatarUrl(
  url: string | null | undefined
): string | null {
  if (!url) {
    return null;
  }

  try {
    const urlObj = new URL(url);
    const providerKey = detectProviderKey(urlObj.hostname);

    if (!providerKey) {
      return url;
    }

    const upgradeFn = PROVIDER_UPGRADE_MAP[providerKey];
    return upgradeFn(url);
  } catch {
    // Invalid URL - return as-is
    return url;
  }
}

/**
 * Check if a URL is from a known OAuth provider that we can upgrade.
 */
export function isUpgradeableAvatarUrl(
  url: string | null | undefined
): boolean {
  if (!url) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    return isKnownProvider(urlObj.hostname);
  } catch {
    return false;
  }
}
