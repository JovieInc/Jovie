/**
 * Placeholder detection for public contact fields. Artists (and imports)
 * leave values like "TBF" or "TBD" in contact records; public profiles must
 * never render them as if they were real company, person, email or phone.
 */
const PLACEHOLDER =
  /^(tb[dfc]|n\/?a|none|null|undefined|todo|placeholder|unknown|xx+|[-?._\s]+)$/i;

export function isPlaceholderValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  return !trimmed || PLACEHOLDER.test(trimmed);
}

/** Returns the trimmed value, or undefined when empty or a placeholder. */
export function realValueOrUndefined(
  value: string | null | undefined
): string | undefined {
  return isPlaceholderValue(value) ? undefined : value?.trim();
}
