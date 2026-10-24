/** One anonymous public audience: caller headers never grant extra fields. */
export const PUBLIC_PROFILE_ELEMENTS = [
  'identity',
  'bio',
  'location',
  'genres',
  'links',
  'audience',
  'contacts',
  'press',
  'releases',
  'events',
  'merch',
  'tips',
  'rider',
] as const;

export type PublicProfileElement = (typeof PUBLIC_PROFILE_ELEMENTS)[number];
export type PublicProfileElements = Readonly<
  Record<PublicProfileElement, boolean>
>;
export interface PublicProfileFieldPolicy {
  readonly version: 1;
  readonly fields: PublicProfileElements;
}

function uniformElements(visible: boolean): PublicProfileElements {
  return Object.freeze(
    Object.fromEntries(
      PUBLIC_PROFILE_ELEMENTS.map(key => [key, visible])
    ) as Record<PublicProfileElement, boolean>
  );
}
const LEGACY_ELEMENTS = uniformElements(true);
const HIDDEN_ELEMENTS = uniformElements(false);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A complete replacement avoids shallow settings merges resetting hidden groups. */
export function isPublicProfileFieldPolicy(
  value: unknown
): value is PublicProfileFieldPolicy {
  if (
    !record(value) ||
    !Object.hasOwn(value, 'version') ||
    !Object.hasOwn(value, 'fields') ||
    value.version !== 1 ||
    !record(value.fields)
  )
    return false;
  if (Object.keys(value).some(key => key !== 'version' && key !== 'fields'))
    return false;
  const fields = value.fields;
  return (
    Object.keys(fields).length === PUBLIC_PROFILE_ELEMENTS.length &&
    PUBLIC_PROFILE_ELEMENTS.every(
      key => Object.hasOwn(fields, key) && typeof fields[key] === 'boolean'
    )
  );
}

/** Missing legacy choice preserves behavior; malformed explicit policy grants nothing. */
export function getPublicProfileElements(
  settings: unknown
): PublicProfileElements {
  if (settings === null || settings === undefined) return LEGACY_ELEMENTS;
  if (!record(settings)) return HIDDEN_ELEMENTS;
  if (!Object.hasOwn(settings, 'public_fields')) return LEGACY_ELEMENTS;
  if (!isPublicProfileFieldPolicy(settings.public_fields))
    return HIDDEN_ELEMENTS;
  return Object.freeze({ ...settings.public_fields.fields });
}

export function isPublicProfileElementVisible(
  settings: unknown,
  element: PublicProfileElement
): boolean {
  return getPublicProfileElements(settings)[element] === true;
}
