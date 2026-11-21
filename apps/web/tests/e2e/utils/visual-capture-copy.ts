/**
 * Copy that marks a capture as an error state. Kept free of Playwright
 * imports so unit tests can check the patterns.
 */

/** Copy that means the surface failed to read its data. */
export const ERROR_COPY_PATTERNS: readonly RegExp[] = [
  /\bunavailable\b/i,
  /something went wrong/i,
  /failed to load/i,
  /could(?:n['’]t| not) (?:be )?(?:load|loaded|read|reach)/i,
  /\bconfiguration error\b/i,
  /\binternal server error\b/i,
  /\bapplication error\b/i,
];

/** Pure check over the text a capture shows; exported for unit tests. */
export function findErrorCopy(text: string): string | null {
  for (const pattern of ERROR_COPY_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 40);
      return text.slice(start, match.index + match[0].length + 40).trim();
    }
  }
  return null;
}
