/**
 * Counted labels must agree with their count ("1 Item", "2 Items"). Use this
 * instead of hard-coding a plural noun after an interpolated number; the
 * counted-label guard (tests/unit/counted-label-pluralization-guard.test.ts)
 * rejects interpolated counts followed by a fixed plural noun.
 */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
