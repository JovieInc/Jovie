/**
 * Tooltip copy rule. A tooltip names a thing; it never explains it.
 *
 *   shape    a title of at most 6 words, plus at most one sentence of at most
 *            15 words ("Title", "Title: one sentence.", or one lone sentence)
 *   content  no marketing claims and no how-it-works explanations; the full
 *            story lives on the surface the control opens (e.g. /changelog)
 *   rich     kbd and a list of at most 3 items only; nothing interactive
 *
 * Pure module (no filesystem imports) so product code can apply the same rule
 * at runtime to copy the static scanner cannot see. The scanner is
 * packages/copy/tooltip-copy-audit.ts (`pnpm design:tooltip-copy:check`).
 */

export const TOOLTIP_COPY_LIMITS = Object.freeze({
  titleWords: 6,
  sentenceWords: 15,
  listItems: 3,
});

export type TooltipCopyRule =
  | 'title-too-long'
  | 'sentence-too-long'
  | 'too-many-sentences'
  | 'explainer-tell';

/** Phrases that mark a claim or an explanation instead of a label. */
export const TOOLTIP_EXPLAINER_TELLS: readonly RegExp[] = [
  /\bso that\b/i,
  /\bwhich means\b/i,
  /\bthis means\b/i,
  /\bin other words\b/i,
  /\bno longer\b/i,
  /\bpromise[sd]?\b/i,
  /\bzero\b/i,
  /\bunder the hood\b/i,
  /\bbehind the scenes\b/i,
];

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** Sentence breaks only: "v1.2", "e.g." and trailing stops do not split. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(])/)
    .map(part => part.trim())
    .filter(Boolean);
}

/**
 * @param text Rendered tooltip text. Interpolations count as one word each.
 */
export function checkTooltipCopy(text: string): TooltipCopyRule[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const rules = new Set<TooltipCopyRule>();
  if (TOOLTIP_EXPLAINER_TELLS.some(tell => tell.test(clean)))
    rules.add('explainer-tell');

  // "Title: body" names its title; otherwise the first of two sentences does.
  const colon = clean.indexOf(': ');
  const titled = colon > 0;
  const title = titled ? clean.slice(0, colon) : undefined;
  const body = sentences(titled ? clean.slice(colon + 2) : clean);
  const lead = title ?? (body.length > 1 ? body.shift() : undefined);

  if (lead && words(lead).length > TOOLTIP_COPY_LIMITS.titleWords)
    rules.add('title-too-long');
  if (body.length > 1) rules.add('too-many-sentences');
  if (body.some(part => words(part).length > TOOLTIP_COPY_LIMITS.sentenceWords))
    rules.add('sentence-too-long');
  return [...rules];
}

/**
 * Shorten runtime copy (a changelog headline, a user-authored name) to a
 * tooltip title: the first sentence, cut on a word boundary at the title
 * limit. Copy that already fits is returned unchanged.
 */
export function shortTooltipTitle(text: string): string {
  const first = sentences(text.replace(/\s+/g, ' ').trim())[0] ?? '';
  const parts = words(first.replace(/[.!?]+$/, ''));
  if (parts.length <= TOOLTIP_COPY_LIMITS.titleWords) return parts.join(' ');
  const cut = parts
    .slice(0, TOOLTIP_COPY_LIMITS.titleWords)
    .join(' ')
    .replace(/[,;:–—-]+$/, '');
  return `${cut}…`;
}
