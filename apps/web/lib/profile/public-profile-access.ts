/** Owner-controlled public access. Missing choices preserve legacy behavior. */
export function isProfileSearchable(settings: unknown): boolean {
  if (settings === undefined || settings === null) return true;
  if (typeof settings !== 'object' || Array.isArray(settings)) return false;
  if (!Object.hasOwn(settings, 'searchable')) return true;
  return (settings as Record<string, unknown>).searchable === true;
}
