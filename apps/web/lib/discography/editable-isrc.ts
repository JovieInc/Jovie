const EDITABLE_ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;

/** Strip separators and uppercase. This does not decide whether the code is valid. */
export function compactEditableIsrc(value: string): string {
  return value
    .trim()
    .replaceAll(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

/**
 * Normalize a release or track ISRC before it is stored.
 * Blank input clears the code. Anything else must match the compact pattern.
 */
export function normalizeEditableIsrc(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;

  const normalized = trimmed.replaceAll(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!EDITABLE_ISRC_PATTERN.test(normalized)) {
    throw new Error('ISRC must be 12 letters and digits');
  }

  return normalized;
}
