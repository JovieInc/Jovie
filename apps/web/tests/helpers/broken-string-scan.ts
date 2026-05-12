/**
 * Rendered-output scanner that catches "looks broken" placeholder strings.
 *
 * Catches gotcha class #2 from JOV-2148: empty/placeholder values rendered
 * as real content (e.g. `"@undefined"`, `"$NaN"`, `"Invalid Date"`, the
 * literal platform name where a handle should be).
 *
 * Two surfaces:
 * - `scanForBrokenStrings(text)`: pure function returning matches; usable
 *   in Vitest unit/integration tests via `expect(...).toEqual([])`.
 * - `expectNoBrokenStrings(textOrElement)`: convenience assertion that
 *   throws with a readable message listing each offending pattern.
 *
 * Add platform-specific strings via the second argument when a test scope
 * knows that, say, the YouTube tab is rendered and the bare word "YouTube"
 * is suspicious.
 */

const DEFAULT_BROKEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\bnull\b/,
  /\bundefined\b/,
  /@undefined\b/,
  /@null\b/,
  /\bNaN\b/,
  /\$NaN/,
  /Invalid Date/,
  // [object Object] shows up when a value is rendered without serializing
  /\[object Object\]/,
];

export interface BrokenStringMatch {
  readonly pattern: string;
  readonly excerpt: string;
}

function asText(input: string | { textContent: string | null }): string {
  return typeof input === 'string' ? input : (input.textContent ?? '');
}

/**
 * Return every broken-pattern match found in `input`. Each entry includes
 * the pattern source and a short excerpt so test failures are diagnosable.
 */
export function scanForBrokenStrings(
  input: string | { textContent: string | null },
  extraPatterns: ReadonlyArray<RegExp> = []
): BrokenStringMatch[] {
  const text = asText(input);
  if (text.length === 0) return [];
  const patterns = [...DEFAULT_BROKEN_PATTERNS, ...extraPatterns];
  const hits: BrokenStringMatch[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const start = Math.max(0, match.index - 20);
    const end = Math.min(text.length, match.index + match[0].length + 20);
    hits.push({
      pattern: pattern.source,
      excerpt: text.slice(start, end),
    });
  }
  return hits;
}

/**
 * Throw if any broken-string patterns are present. Drop-in for inline
 * assertions: `expectNoBrokenStrings(container)`.
 */
export function expectNoBrokenStrings(
  input: string | { textContent: string | null },
  extraPatterns: ReadonlyArray<RegExp> = []
): void {
  const hits = scanForBrokenStrings(input, extraPatterns);
  if (hits.length === 0) return;
  const lines = hits
    .map(h => `  - /${h.pattern}/ near: …${h.excerpt}…`)
    .join('\n');
  throw new Error(
    `Rendered output contains ${hits.length} broken-string pattern(s):\n${lines}`
  );
}
