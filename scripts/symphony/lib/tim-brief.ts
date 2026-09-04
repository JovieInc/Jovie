/**
 * Tim Communication Filter (GH #13123) — shared formatter for Hermes-Air
 * alerts sent directly to Tim (Telegram/Slack). Watch-cron output was
 * landing as a wall of internal error codes; Tim's ask was plain-English
 * items he can reply to and move on:
 *
 *   "Give me three actionable items where I can just respond to you with
 *   what to do and then go do it. Don't send me a bunch of issue codes and
 *   technical jargon."
 *
 * Rules enforced here:
 * 1. Max 3 items per message; the rest are deferred, not dropped.
 * 2. Each item is one-line problem + one-line action + one-line default.
 * 3. Internal IDs/codes never appear inline — they go in a footnoted
 *    "Refs:" block at the end.
 * 4. Every item ends with a reply contract: Do this / Skip / Defer.
 */

export interface TimBriefItem {
  /** One-line plain-English description of what's wrong. No internal IDs/codes. */
  readonly problem: string;
  /** One sentence: what Tim needs to do. */
  readonly action: string;
  /** One sentence: what happens if Tim does nothing. */
  readonly defaultAction: string;
  /** Internal ID/error code for this item — surfaced only in the footnote block. */
  readonly ref?: string;
}

const DEFAULT_MAX_ITEMS = 3;

export function formatTimBrief(
  items: ReadonlyArray<TimBriefItem>,
  options?: { readonly title?: string; readonly maxItems?: number }
): string {
  if (items.length === 0) return '';

  const maxItems = Math.max(0, options?.maxItems ?? DEFAULT_MAX_ITEMS);
  const shown = items.slice(0, maxItems);
  const deferredCount = items.length - shown.length;

  const lines: string[] = [];
  if (options?.title) lines.push(options.title, '');

  shown.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.problem}`,
      `   Action: ${item.action}`,
      `   Default: ${item.defaultAction}`,
      `   Reply: Do this / Skip / Defer`,
      ''
    );
  });

  if (deferredCount > 0) {
    lines.push(
      `(+${deferredCount} more deferred — reply "more" to see them.)`,
      ''
    );
  }

  // Only footnote refs for items actually described above — a ref for a
  // deferred, undescribed item would be a floating code with no context,
  // which is the exact confusion this formatter exists to remove.
  const refs = [
    ...new Set(
      shown.map(item => item.ref).filter((ref): ref is string => Boolean(ref))
    ),
  ];
  if (refs.length > 0) {
    lines.push(`Refs: ${refs.join(', ')}`);
  }

  return lines.join('\n').trimEnd();
}
