/**
 * Detect a `/command` trigger at the caret position inside a textarea.
 *
 * A trigger matches when:
 *   - a literal `/` appears at index `startIdx` (the return value)
 *   - `startIdx` is either index 0, or the character immediately before it
 *     is whitespace (so `a/foo` does NOT trigger — the `/` is mid-word)
 *   - no whitespace or second `/` appears between that `/` and the caret
 *
 * Returns `{ startIdx, query }` where `query` is the substring after the
 * `/` up to the caret, or `null` when no trigger is active.
 *
 * Extracted so the regex logic can be unit-tested without mounting React.
 */
export interface SlashTrigger {
  readonly startIdx: number;
  readonly query: string;
}

const TRIGGER_PATTERN = /(^|\s)\/([^\s/]*)$/;

export function detectSlashTriggerAt(
  text: string,
  caret: number
): SlashTrigger | null {
  const head = text.slice(0, caret);
  const match = TRIGGER_PATTERN.exec(head);
  if (!match) return null;
  const startIdx = (match.index ?? 0) + match[1].length;
  return { startIdx, query: match[2] };
}
