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

/**
 * Pure check over the text a capture shows; exported for unit tests. Returns
 * up to three snippets around error copy, or null. `allowCopy` removes help
 * text that only mentions a word like "unavailable" before the check.
 */
export function findErrorCopy(
  text: string,
  allowCopy: readonly RegExp[] = []
): string | null {
  let checked = text;
  for (const allowed of allowCopy) {
    checked = checked.replace(
      new RegExp(
        allowed.source,
        allowed.flags.includes('g') ? allowed.flags : `${allowed.flags}g`
      ),
      ' '
    );
  }
  const snippets: string[] = [];
  for (const pattern of ERROR_COPY_PATTERNS) {
    const match = pattern.exec(checked);
    if (!match) continue;
    const start = Math.max(0, match.index - 40);
    snippets.push(
      checked
        .slice(start, match.index + match[0].length + 40)
        .replace(/\s+/g, ' ')
        .trim()
    );
    if (snippets.length === 3) break;
  }
  return snippets.length > 0 ? snippets.join(' | ') : null;
}
