/**
 * OpportunityRow state — the canonical inbox row states.
 * Matches the v4 approved design spec (#13170).
 */
export type OpportunityRowState =
  | 'new'
  | 'accepted'
  | 'rejected'
  | 'in-progress'
  | 'reported';

/**
 * Accent dot variant for a row state.
 */
export type OpportunityRowAccent =
  | 'accent'
  | 'green'
  | 'gray'
  | 'amber'
  | 'dim';

export const STATE_ACCENT: Record<OpportunityRowState, OpportunityRowAccent> = {
  new: 'accent',
  accepted: 'green',
  rejected: 'gray',
  'in-progress': 'amber',
  reported: 'gray',
};

/**
 * Props for the OpportunityRow component.
 *
 * The row is a flat, no-container, no-border list item. It renders as a single
 * list item with a status dot, two-line type, and hover-reveal actions.
 */
export interface OpportunityRowProps {
  /** Unique identifier for the opportunity */
  readonly id: string;
  /** Row visual state — controls dot color, action persistence, and checkmark */
  readonly state: OpportunityRowState;
  /** Line 1: primary title (e.g. "Detroit listeners up 340%") */
  readonly title: string;
  /** Line 2: secondary metadata (e.g. "Magic Stick · 3/15 · 92% match · $2k") */
  readonly metadata: string;
  /** When true, the row is considered "read"/old and shows no dot */
  readonly hideDot?: boolean;
  /** Callback when primary action (→/✓) is triggered */
  readonly onPrimaryAction?: (id: string) => void;
  /** Callback when dismiss (x) is triggered */
  readonly onDismiss?: (id: string) => void;
  /** When true, action buttons are disabled (loading state) */
  readonly isBusy?: boolean;
  /** Additional class names for the row element */
  readonly className?: string;
  /** Test id for the row element */
  readonly dataTestId?: string;
}
