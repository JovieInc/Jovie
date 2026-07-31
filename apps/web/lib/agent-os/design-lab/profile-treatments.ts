/**
 * Deterministic redesign treatments for the profile proposal loop (JOV-1951).
 *
 * Each treatment is a mockup direction only. Production rollout requires D2
 * approval (yes / yes-with-notes) via the Design Lab review panel; this catalog
 * never mutates live profile UI.
 */

export interface ProfileRedesignTreatment {
  readonly id: string;
  readonly title: string;
  readonly proposalBody: string;
  readonly weight: number;
}

export const PROFILE_REDESIGN_TREATMENTS: readonly ProfileRedesignTreatment[] =
  [
    {
      id: 'quiet-hero',
      title: 'Quiet hero header',
      proposalBody:
        'Replace the full-bleed hero gradient with a restrained surface-1 header band, left-aligned artist name, and a single accent underline on the active tab. Keep the compact tab bar and avoid decorative hover lift.',
      weight: 0.95,
    },
    {
      id: 'listen-first-stack',
      title: 'Listen-first home stack',
      proposalBody:
        'Lead the home surface with a single featured release + primary Listen CTA, demote secondary social chips to a quiet row, and reserve a fixed-height slot for the tab panel so mode switches never shift layout.',
      weight: 0.88,
    },
    {
      id: 'subtractive-chrome',
      title: 'Subtractive chrome pass',
      proposalBody:
        'Remove nested card chrome around the profile shell, drop redundant section labels already implied by the tab bar, and tighten vertical rhythm so the artist photo, name, and primary action read as one quiet column.',
      weight: 0.82,
    },
  ] as const;

export function listProfileRedesignTreatments(): readonly ProfileRedesignTreatment[] {
  return PROFILE_REDESIGN_TREATMENTS;
}
