/**
 * Lowercase a platform id/name and strip separators so registry ids
 * (`apple_music`), slugs (`apple-music`), and display names all resolve to
 * the same icon key.
 */
export function normalizeSocialIconKey(platform: string): string {
  return platform.toLowerCase().replaceAll(/[\s_-]+/g, '');
}
