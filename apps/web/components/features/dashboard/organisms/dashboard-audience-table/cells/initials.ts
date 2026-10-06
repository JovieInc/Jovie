import { getInitials } from '@jovie/ui';

/** Grapheme-safe initials; delegates to the canonical Avatar contract. */
export function getMonogramInitials(name: string | null | undefined): string {
  return getInitials(name ?? '');
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
  'bg-surface-0 text-tertiary-token',
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
