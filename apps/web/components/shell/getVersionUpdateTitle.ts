/**
 * Title for the in-app "New Version Available" banner.
 *
 * Omits the version parenthetical when the incoming version is missing,
 * blank, or the unresolved `0.0.0` placeholder so the banner never
 * advertises a bogus release (JOV-3459).
 */
export function getVersionUpdateTitle(
  newVersion: string | null | undefined,
  options?: { readonly titleCase?: boolean }
): string {
  const base =
    options?.titleCase === false
      ? 'New version available'
      : 'New Version Available';
  const version = newVersion?.trim();
  if (!version || version === '0.0.0') {
    return base;
  }
  return `${base} (v${version})`;
}
