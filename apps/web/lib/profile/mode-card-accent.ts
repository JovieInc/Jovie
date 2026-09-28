/**
 * Founder accent rotation for public-profile mode cards (Tim, 2026-09-26).
 * Canonical rule: docs/design-system/DETAILS.md "Accent color follows the
 * founder rotation rule".
 *
 * - Background only: the accent tints a card's background gradient. Text,
 *   glyphs, and CTAs stay neutral, and the focus/link accent never rotates.
 * - Visual order: Ion (blue) → Ultra (purple) → Pulse (pink). Orange enters
 *   only after those three have been used on the surface. Adjacent cards never
 *   share an accent.
 * - Image anchor: a card carrying artwork or a photo may name the accent that
 *   complements its art. That anchor wins (unless it would repeat the previous
 *   card), the rotation continues from it, and the card is desaturated
 *   strongly so the art wins.
 *
 * Pure and deterministic: the same card list always yields the same accents,
 * so server and client renders agree.
 */

export const PROFILE_CARD_ACCENTS = Object.freeze([
  'ion',
  'ultra',
  'pulse',
  'orange',
] as const);

export type ProfileCardAccent = (typeof PROFILE_CARD_ACCENTS)[number];

/** The three accents that rotate before orange may enter. */
const PRIMARY_ROTATION: readonly ProfileCardAccent[] = [
  'ion',
  'ultra',
  'pulse',
];

/**
 * `text` cards keep more chroma. `art` cards sit behind artwork or a photo and
 * are desaturated strongly (lower OKLCH chroma only) so the art wins.
 */
export type ProfileCardAccentStrength = 'text' | 'art';

export interface ProfileCardAccentInput {
  /** Accent that best complements the card's artwork, when it has any. */
  readonly imageAnchor?: ProfileCardAccent | null;
  /** The card carries artwork or a photo (drives the desaturation level). */
  readonly hasImage?: boolean;
}

export interface ProfileCardAccentAssignment {
  readonly accent: ProfileCardAccent;
  readonly strength: ProfileCardAccentStrength;
}

/**
 * Default anchor for release artwork until per-artwork palette data exists.
 * Ultra is the Pen-approved choice for the featured Listen card: violet sits
 * beside both cool artwork and skin tones without clashing, where pink and
 * orange fight faces. Callers with real palette data pass their own anchor.
 */
export const DEFAULT_ARTWORK_ACCENT: ProfileCardAccent = 'ultra';

function nextInCycle(
  cycle: readonly ProfileCardAccent[],
  previous: ProfileCardAccent | null,
  isEligible: (accent: ProfileCardAccent) => boolean
): ProfileCardAccent | null {
  const previousIndex = previous ? cycle.indexOf(previous) : -1;
  for (let step = 1; step <= cycle.length; step += 1) {
    const candidate =
      cycle[(previousIndex + step + cycle.length) % cycle.length];
    if (candidate && candidate !== previous && isEligible(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Assign one accent per card, in visual order.
 */
export function resolveProfileCardAccents(
  cards: readonly ProfileCardAccentInput[]
): ProfileCardAccentAssignment[] {
  const used = new Set<ProfileCardAccent>();
  const assignments: ProfileCardAccentAssignment[] = [];
  let previous: ProfileCardAccent | null = null;

  for (const card of cards) {
    const anchor = card.imageAnchor ?? null;
    let accent: ProfileCardAccent;

    if (anchor && anchor !== previous) {
      accent = anchor;
    } else {
      const hasUnusedPrimary = PRIMARY_ROTATION.some(item => !used.has(item));
      accent =
        (hasUnusedPrimary
          ? nextInCycle(PRIMARY_ROTATION, previous, item => !used.has(item))
          : null) ??
        (used.has('orange') || previous === 'orange' ? null : 'orange') ??
        // Every accent is spent: keep cycling all four, never repeating the
        // previous card.
        nextInCycle(PROFILE_CARD_ACCENTS, previous, () => true) ??
        'ion';
    }

    used.add(accent);
    previous = accent;
    assignments.push({
      accent,
      strength: card.hasImage || anchor ? 'art' : 'text',
    });
  }

  return assignments;
}

/**
 * Mode cards on the public profile, in visual (tab) order: the featured
 * Listen card on Home, Events, Payments on About, then Stay close. Each mode
 * renders one card at a time, so rotating across the whole sequence keeps
 * every card's accent distinct from its neighbours as the visitor moves
 * between tabs.
 */
export const PROFILE_MODE_CARD_ORDER = Object.freeze([
  'listen',
  'events',
  'payments',
  'stay-close',
] as const);

export type ProfileModeCardKind = (typeof PROFILE_MODE_CARD_ORDER)[number];

export function resolveProfileModeCardAccents(
  options: Readonly<{
    /** Anchor for the featured Listen card when it shows artwork. */
    readonly listenArtworkAccent?: ProfileCardAccent | null;
  }> = {}
): Readonly<Record<ProfileModeCardKind, ProfileCardAccentAssignment>> {
  const listenAnchor = options.listenArtworkAccent ?? null;
  const assignments = resolveProfileCardAccents(
    PROFILE_MODE_CARD_ORDER.map(kind =>
      kind === 'listen'
        ? { imageAnchor: listenAnchor, hasImage: Boolean(listenAnchor) }
        : {}
    )
  );

  return Object.freeze(
    Object.fromEntries(
      PROFILE_MODE_CARD_ORDER.map((kind, index) => [kind, assignments[index]])
    ) as Record<ProfileModeCardKind, ProfileCardAccentAssignment>
  );
}
