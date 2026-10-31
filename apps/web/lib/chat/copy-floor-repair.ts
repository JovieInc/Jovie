/**
 * Deterministic repair for mechanical copy-floor violations in Jovie replies.
 *
 * Em and en dashes are a floor failure (canon/VOICE.md, founder decision
 * 2026-09-25) and the model emits them constantly. Before this repair, the
 * persist-boundary gate (JOV-6616) swapped any reply containing one for
 * "That answer missed the mark", so a good answer streamed live and then
 * disappeared from history. The floor says senders must rewrite, so rewrite
 * the dash instead of discarding the answer.
 *
 * Only punctuation is touched. Words, numbers and markdown structure stay.
 */

import type { StreamTextTransform, TextStreamPart, ToolSet } from 'ai';

const DIGIT_RANGE = /(\d)\s*[–—]\s*(\d)/g;
const AFTER_BOLD = /(\*\*|__)\s*[–—]\s*/g;
const DOUBLE_HYPHEN = /\s--\s/g;
const ANY_DASH = /\s*[–—]\s*/g;

/**
 * @param atLineStart whether `text` begins at the start of a line. Stream
 *   chunks begin mid-line, so a leading dash there is not a list marker.
 */
export function repairCopyFloorText(text: string, atLineStart = true): string {
  if (!/[–—]|\s--\s/.test(text)) return text;
  const lineStart = atLineStart ? /(^|\n)(\s*)[–—]\s*/g : /(\n)(\s*)[–—]\s*/g;
  return (
    text
      .replace(DIGIT_RANGE, '$1-$2')
      .replace(AFTER_BOLD, (m, bold: string, at: number, all: string) =>
        at + m.length === all.length ? `${bold}:` : `${bold}: `
      )
      .replace(lineStart, '$1$2- ')
      .replace(DOUBLE_HYPHEN, ', ')
      // A dash at the very end of a stream chunk: the next chunk brings the space.
      .replace(ANY_DASH, (m, at: number, all: string) =>
        at + m.length === all.length ? ',' : ', '
      )
      .replace(/,\s*([.,;:!?])/g, '$1')
      .replace(/ {2,}/g, ' ')
  );
}

/**
 * Hold the last three whitespace-separated tokens: every dash pattern
 * ("2 – 4", "**Label** — text", "word — word") spans at most three, so the
 * held tail always repairs together with whatever arrives next.
 */
const HOLD_TOKENS = 3;

/** Split `raw` into an emit-now head and a held tail (see above). */
export function splitHeldTail(raw: string): { head: string; held: string } {
  const starts = [...raw.matchAll(/\S+\s*/g)].map(m => m.index ?? 0);
  let cut = starts.length > HOLD_TOKENS ? (starts.at(-HOLD_TOKENS) ?? 0) : 0;
  // Hand the separator and a closing bold marker to the tail so a dash that
  // follows them repairs to ", " or "**: " rather than " , ".
  while (cut > 0 && /\s/.test(raw[cut - 1] ?? '')) cut -= 1;
  if (cut >= 2 && /\*\*|__/.test(raw.slice(cut - 2, cut))) cut -= 2;
  return { head: raw.slice(0, cut), held: raw.slice(cut) };
}

/**
 * Stream transform that applies `repairCopyFloorText` to text deltas so the
 * artist never sees a dash and the persisted text matches what streamed.
 * Trailing whitespace is held back one delta so a dash that arrives as its
 * own delta joins the previous word cleanly ("Swim, the" not "Swim , the").
 */
export function copyFloorRepairTransform<
  TOOLS extends ToolSet,
>(): StreamTextTransform<TOOLS> {
  return () => {
    let pendingId: string | null = null;
    let pending = '';
    let atLineStart = true;

    const emit = (
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
      id: string,
      raw: string
    ) => {
      if (raw.length === 0) return;
      const text = repairCopyFloorText(raw, atLineStart);
      atLineStart = text.endsWith('\n');
      controller.enqueue({
        type: 'text-delta',
        id,
        text,
      } as TextStreamPart<TOOLS>);
    };

    const flush = (
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>
    ) => {
      if (pendingId !== null) emit(controller, pendingId, pending);
      pendingId = null;
      pending = '';
    };

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type !== 'text-delta') {
          flush(controller);
          controller.enqueue(part);
          return;
        }
        if (pendingId !== null && pendingId !== part.id) flush(controller);
        const { head, held } = splitHeldTail(pending + part.text);
        pendingId = part.id;
        pending = held;
        emit(controller, part.id, head);
      },
      flush(controller) {
        flush(controller);
      },
    });
  };
}
