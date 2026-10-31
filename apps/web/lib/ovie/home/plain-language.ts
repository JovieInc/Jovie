/**
 * Plain-language outcomes for Home lists. Commit and PR titles read like
 * `fix(lanes): keep the status feed under the cap (#23098)`; Tim reads the
 * outcome, with the number as a quiet secondary.
 */
const CONVENTIONAL =
  /^(?:feat|fix|perf|refactor|chore|docs|test|ci|build|style|revert)(?:\([^)]*\))?!?:\s*/i;
const TRAILING_NUMBER = /\s*(?:·|-|—)?\s*\(?#(\d+)\)?\s*$/;
const LEADING_ISSUE = /^[A-Z]{2,6}-\d+[:\s]+/;

export interface PlainOutcome {
  /** The outcome in words: prefix, scope and number removed, first letter capital. */
  readonly text: string;
  /** "#23098" when the title carried one, else null. */
  readonly reference: string | null;
}

export function plainOutcome(title: string): PlainOutcome {
  let text = title.trim();
  let reference: string | null = null;
  const trailing = TRAILING_NUMBER.exec(text);
  if (trailing) {
    reference = `#${trailing[1]}`;
    text = text.slice(0, trailing.index).trim();
  }
  text = text.replace(LEADING_ISSUE, '').replace(CONVENTIONAL, '').trim();
  if (text.length === 0) text = title.trim();
  return {
    text: text.charAt(0).toUpperCase() + text.slice(1),
    reference,
  };
}
