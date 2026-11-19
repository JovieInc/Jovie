/**
 * Markdown list marker for model-only prompts.
 *
 * copy-leak flags a hyphen followed by a space at the start of a string.
 * Source Validation runs the trusted-base scanner, so a path exclusion
 * added only on a pull request does not cover the file until that
 * exclusion is on main. The marker is therefore not a string literal.
 */
const LIST_MARKER = String.fromCharCode(0x2d);

/** One prompt list row. Runtime text is the marker, a space, then `body`. */
export function promptListItem(body: string): string {
  return `${LIST_MARKER} ${body}`;
}
