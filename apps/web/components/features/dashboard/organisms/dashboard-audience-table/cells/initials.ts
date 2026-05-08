/**
 * Grapheme-safe initial extraction. Replaces packages/ui's `getInitials`,
 * which uses `charAt(0)` and breaks on emoji-prefixed names, CJK, and
 * combining marks. Falls back to charAt-based slicing if Intl.Segmenter is
 * unavailable in the runtime.
 */
export function getMonogramInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';

  const Segmenter = (
    globalThis as { Intl?: { Segmenter?: typeof Intl.Segmenter } }
  ).Intl?.Segmenter;

  const firstGrapheme = (input: string): string => {
    if (Segmenter) {
      const seg = new Segmenter(undefined, { granularity: 'grapheme' });
      const it = seg.segment(input)[Symbol.iterator]();
      const next = it.next();
      return next.done ? '' : next.value.segment;
    }
    return input.charAt(0);
  };

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return firstGrapheme(parts[0]).toUpperCase();
  const last = parts.at(-1) ?? '';
  return (firstGrapheme(parts[0]) + firstGrapheme(last)).toUpperCase();
}

/**
 * Deterministic monogram fill class derived from a name. Returns one of a
 * curated low-saturation palette (no gold, no semantic colors that overlap
 * with state pills).
 */
const MONOGRAM_PALETTE = [
  'bg-surface-2 text-primary-token',
  'bg-surface-2 text-secondary-token',
  'bg-surface-1 text-secondary-token',
  'bg-surface-2 text-primary-token',
  'bg-indigo-900/50 text-indigo-100',
  'bg-violet-900/50 text-violet-100',
  'bg-blue-900/50 text-blue-100',
  'bg-teal-900/50 text-teal-100',
] as const;

export function getMonogramTone(name: string | null | undefined): string {
  const seed = (name ?? '').trim();
  if (!seed) return MONOGRAM_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return MONOGRAM_PALETTE[hash % MONOGRAM_PALETTE.length];
}
