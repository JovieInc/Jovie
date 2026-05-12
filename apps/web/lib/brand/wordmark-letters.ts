/**
 * Geometric JOVIE wordmark — five hand-drawn letters on a 100u cap height
 * with a uniform 22u stem weight. The O is the mark's outer-ring proportions
 * verbatim (R=50 outer, R=27 inner, same 174:94 ratio as the mark's ring),
 * so the wordmark and the symbol read as siblings rather than "a symbol + a font."
 *
 * Cap height: 100. Stem weight: 22 (every vertical, diagonal, and horizontal).
 *
 * Total uncentered width = 374u: J(66) + JO(12) + O(100) + OV(12) + V(76) + VI(8)
 *                              + I(22) + IE(14) + E(64) = 374
 */

export interface LetterPath {
  readonly w: number;
  readonly d: string;
  readonly rule?: 'evenodd';
}

export const LETTER_PATHS: Readonly<
  Record<'J' | 'O' | 'V' | 'I' | 'E', LetterPath>
> = {
  // J — vertical stem with a clean semicircular hook. Stem width 22; outer
  // hook radius 33, inner radius 11, so wall thickness stays 22 around the
  // curve. Hook bottom kisses the baseline at y=100.
  J: {
    w: 66,
    d: 'M 66 0 L 66 67 A 33 33 0 0 1 0 67 L 22 67 A 11 11 0 0 0 44 67 L 44 0 Z',
  },
  // O — outer R=50, inner R=27 (matches mark's 174:94). Drawn with evenodd so
  // the inner counter renders as negative space.
  O: {
    w: 100,
    d: 'M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z M 50 23 A 27 27 0 1 0 50 77 A 27 27 0 1 0 50 23 Z',
    rule: 'evenodd',
  },
  // V — outer width 76, apex at (38,100). Inner cutout opens to (24,0)→
  // (38,70)→(52,0), giving 22-unit stems along the diagonals.
  V: { w: 76, d: 'M 0 0 L 24 0 L 38 70 L 52 0 L 76 0 L 44 100 L 32 100 Z' },
  // I — single stem, width 22.
  I: { w: 22, d: 'M 0 0 L 22 0 L 22 100 L 0 100 Z' },
  // E — three horizontal bars + a vertical. The middle bar is shorter (54
  // vs 64) and the central waist drops 1 unit below center to optically
  // balance the bottom bar's gravity.
  E: {
    w: 64,
    d: 'M 0 0 L 64 0 L 64 22 L 22 22 L 22 39 L 54 39 L 54 61 L 22 61 L 22 78 L 64 78 L 64 100 L 0 100 Z',
  },
} as const;

export const LETTER_SEQUENCE = ['J', 'O', 'V', 'I', 'E'] as const;
export const LETTER_PAIRS = ['JO', 'OV', 'VI', 'IE'] as const;

export type WordmarkLetter = (typeof LETTER_SEQUENCE)[number];
export type WordmarkPair = (typeof LETTER_PAIRS)[number];

export interface PlacedLetter {
  readonly letter: WordmarkLetter;
  readonly x: number;
  readonly w: number;
  readonly d: string;
  readonly rule?: 'evenodd';
}

export interface WordmarkLayout {
  readonly placed: readonly PlacedLetter[];
  readonly totalWidth: number;
}

/**
 * Single source of truth for the geometric JOVIE wordmark layout. Returns
 * each letter's placement on the 100u cap-height grid plus the total width
 * after kerning. Consumed by both the React Wordmark primitive and the
 * static SVG generation script — no math is duplicated.
 */
export function computeWordmarkLayout(
  trackingMap: Readonly<Record<WordmarkPair, number>>
): WordmarkLayout {
  const placed: PlacedLetter[] = LETTER_SEQUENCE.reduce<PlacedLetter[]>(
    (acc, letter, i) => {
      const prev = acc[i - 1];
      const prevPair = i > 0 ? LETTER_PAIRS[i - 1] : undefined;
      const prevAdvance = prev
        ? prev.w + (prevPair ? trackingMap[prevPair] : 0)
        : 0;
      const x = (prev?.x ?? 0) + prevAdvance;
      const p = LETTER_PATHS[letter];
      acc.push({ letter, x, w: p.w, d: p.d, rule: p.rule });
      return acc;
    },
    []
  );
  const last = placed[placed.length - 1];
  const lastPair = LETTER_PAIRS[placed.length - 1];
  const totalWidth = last.x + last.w + (lastPair ? trackingMap[lastPair] : 0);
  return { placed, totalWidth };
}
