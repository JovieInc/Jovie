/**
 * Profile redesign targets for JOV-1951.
 *
 * Owned = Jovie-controlled public/demo profiles we can redesign against.
 * Competitor = selected external bio-link handles used only as comparative
 * framing for mockup proposals — never scraped or mutated by this loop.
 */

export const PROFILE_REDESIGN_TARGET_KINDS = ['owned', 'competitor'] as const;

export type ProfileRedesignTargetKind =
  (typeof PROFILE_REDESIGN_TARGET_KINDS)[number];

export interface ProfileRedesignTarget {
  readonly id: string;
  readonly kind: ProfileRedesignTargetKind;
  readonly handle: string;
  readonly displayName: string;
  /** Stable route or external URL used only as mockup framing context. */
  readonly referenceUrl: string;
  /** Optional in-app capture route for owned targets. */
  readonly captureRoute: string | null;
  readonly weight: number;
}

/**
 * Jovie-owned profiles used for redesign mockups.
 * Keep this list small and curated — the loop is for A/B layout ideas, not
 * exhaustive inventory.
 */
export const PROFILE_REDESIGN_OWNED_TARGETS: readonly ProfileRedesignTarget[] =
  [
    {
      id: 'owned-tim',
      kind: 'owned',
      handle: 'tim',
      displayName: 'Tim White',
      referenceUrl: 'https://jov.ie/tim',
      captureRoute: '/demo/showcase/tim-white-profile',
      weight: 1,
    },
    {
      id: 'owned-dualipa',
      kind: 'owned',
      handle: 'dualipa',
      displayName: 'Dua Lipa (demo)',
      referenceUrl: 'https://jov.ie/dualipa',
      captureRoute: '/dualipa',
      weight: 0.9,
    },
  ] as const;

/**
 * Selected competitor bio-link handles for comparative redesign proposals.
 * These are framing references only — the loop never writes competitor data
 * or production UI.
 */
export const PROFILE_REDESIGN_COMPETITOR_TARGETS: readonly ProfileRedesignTarget[] =
  [
    {
      id: 'competitor-linktree-dualipa',
      kind: 'competitor',
      handle: 'dualipa',
      displayName: 'Dua Lipa on Linktree',
      referenceUrl: 'https://linktr.ee/dualipa',
      captureRoute: null,
      weight: 0.75,
    },
    {
      id: 'competitor-beacons-example',
      kind: 'competitor',
      handle: 'beacons',
      displayName: 'Beacons creator template',
      referenceUrl: 'https://beacons.ai/',
      captureRoute: null,
      weight: 0.65,
    },
  ] as const;

export function listProfileRedesignTargets(options?: {
  readonly kinds?: readonly ProfileRedesignTargetKind[];
}): readonly ProfileRedesignTarget[] {
  const kinds = options?.kinds;
  const all = [
    ...PROFILE_REDESIGN_OWNED_TARGETS,
    ...PROFILE_REDESIGN_COMPETITOR_TARGETS,
  ];

  if (!kinds || kinds.length === 0) {
    return all;
  }

  const allowed = new Set(kinds);
  return all.filter(target => allowed.has(target.kind));
}
