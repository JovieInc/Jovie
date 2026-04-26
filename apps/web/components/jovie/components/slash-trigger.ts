import type { EntityKind } from '@/lib/chat/tokens';

/**
 * Detect a `/command` trigger at the caret position inside a textarea.
 *
 * A trigger matches when:
 *   - a literal `/` appears at index `startIdx` (the return value)
 *   - `startIdx` is either index 0, or the character immediately before it
 *     is whitespace (so `a/foo` does NOT trigger — the `/` is mid-word)
 *   - no second `/` appears between that `/` and the caret
 *
 * Returns `{ startIdx, query, directKind? }` where:
 *   - `query` is the substring after the `/` up to the caret, or after the
 *     direct-entry prefix when one is present
 *   - `directKind` is set when the user opted into a direct entity entry by
 *     prefixing the query with `release `, `artist`, or `event` followed by
 *     a space (case-insensitive). The prefix is stripped from `query`.
 *
 * Returns `null` when no trigger is active.
 *
 * Extracted so the regex logic can be unit-tested without mounting React.
 */
export interface SlashTrigger {
  readonly startIdx: number;
  readonly query: string;
  /**
   * Set when the slash query opens directly into a kind-locked entity
   * picker, e.g. `/release midnight` or `/event ` — power users skip the
   * root picker entirely. The leading `/` stays at `startIdx`; the prefix
   * is stripped from `query`.
   */
  readonly directKind?: EntityKind;
}

/**
 * Allowed direct-entry prefixes. `track` is intentionally omitted — the
 * track entity provider does not exist yet, so promoting `/track ` would
 * dead-end the user.
 */
const DIRECT_KIND_BY_PREFIX: ReadonlyMap<string, EntityKind> = new Map([
  ['release', 'release'],
  ['artist', 'artist'],
  ['event', 'event'],
]);

/**
 * Tries the direct-entry pattern first: `/<prefix> <rest>` at the end of
 * `head`, where `rest` may contain spaces but no `/` (a `/` would start a
 * new trigger). Returns null if no direct prefix matches.
 */
const DIRECT_PATTERN = /(^|\s)\/([A-Za-z]+) ([^/]*)$/;

/** Strict trigger: `/` followed by zero-or-more non-space, non-slash chars. */
const TRIGGER_PATTERN = /(^|\s)\/([^\s/]*)$/;

export function detectSlashTriggerAt(
  text: string,
  caret: number
): SlashTrigger | null {
  const head = text.slice(0, caret);

  // Direct-entry path: `/release midnight`, `/event `, etc. The space after
  // the prefix promotes the picker into entity mode for that kind.
  const directMatch = DIRECT_PATTERN.exec(head);
  if (directMatch) {
    const startIdx = (directMatch.index ?? 0) + directMatch[1].length;
    const kind = DIRECT_KIND_BY_PREFIX.get(directMatch[2].toLowerCase());
    if (kind) {
      return { startIdx, query: directMatch[3], directKind: kind };
    }
    // Not a recognized direct prefix — fall through to the strict pattern,
    // which will fail (because the matched chars include a space). Treat as
    // no trigger.
    return null;
  }

  const match = TRIGGER_PATTERN.exec(head);
  if (!match) return null;
  const startIdx = (match.index ?? 0) + match[1].length;
  return { startIdx, query: match[2] };
}
