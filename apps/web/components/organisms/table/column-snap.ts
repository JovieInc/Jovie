/**
 * Layout snap when table columns appear or disappear.
 *
 * Duration matches --ds-motion-subtle-duration (150ms). Motion's layout
 * transition retargets if the container width changes again mid-flight.
 * Rows past the cap share one delay so a long table does not queue motion.
 */
export const COLUMN_SNAP_DURATION_S = 0.15;
export const COLUMN_SNAP_STAGGER_S = 0.02;
export const COLUMN_SNAP_STAGGER_CAP = 7;

export function columnSnapTransition(visibleOrder: number): {
  readonly layout: {
    readonly duration: number;
    readonly ease: 'easeOut';
    readonly delay: number;
  };
} {
  const order = Math.max(
    0,
    Math.min(Math.trunc(visibleOrder), COLUMN_SNAP_STAGGER_CAP)
  );
  return {
    layout: {
      duration: COLUMN_SNAP_DURATION_S,
      ease: 'easeOut',
      delay: order * COLUMN_SNAP_STAGGER_S,
    },
  };
}
