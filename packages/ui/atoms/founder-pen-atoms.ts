/**
 * Skill-passed founder atom masters on the canonical Pen file
 * `Jovie Design Studio — canonical.pen` (live-canvas frontend-skill PASS,
 * 2026-08-14; durable save landed the same day — JOV-5095).
 *
 * Product consumers must reference these masters. Visual divergence is drift
 * and there is no second master per family. Families without a mapped Jovie
 * source consumer stay fail-closed: `consumer` is `null`, the Pen root is
 * recorded so no replacement master gets invented, and nothing here ever
 * authorizes a Pen write or a guessed component binding.
 */
export const FOUNDER_PEN_ATOM_IDS = {
  palette: 'QFA71',
  surfaces: 'ovdxc',
  geometry: 'yxp2C',
  actionButton: 'g3IC1',
  iconButton: 'XYhft',
  statusControl: 'KOTod',
  overflow: 'OVLxQ',
  board: 'stD8g',
} as const;

export type FounderPenAtomFamily = keyof typeof FOUNDER_PEN_ATOM_IDS;

export const FOUNDER_PEN_ATOM_FAMILIES = Object.keys(
  FOUNDER_PEN_ATOM_IDS
) as readonly FounderPenAtomFamily[];

/**
 * Jovie source consumer for each founder atom master, or `null` when the
 * family is a Pen-only master whose owning product binding is outside this
 * repo or has not been promoted. Token-level families (palette, surfaces,
 * geometry) bind to the shared theme tokens module; `actionButton` resolves
 * through the executable Button Pen family map (`button/primary/lg/idle` →
 * `g3IC1`); `overflow` renders through the IconButton compatibility API.
 */
export const FOUNDER_PEN_ATOM_CONSUMERS: Readonly<
  Record<FounderPenAtomFamily, string | null>
> = {
  palette: 'packages/ui/theme/tokens.ts',
  surfaces: 'packages/ui/theme/tokens.ts',
  geometry: 'packages/ui/theme/tokens.ts',
  actionButton: 'packages/ui/atoms/button-contract.ts',
  iconButton: 'packages/ui/atoms/icon-button-contract.ts',
  statusControl: null,
  overflow: 'packages/ui/atoms/overflow-menu-trigger.tsx',
  board: null,
};
