import { describe, expect, it } from 'vitest';
import {
  COLUMN_SNAP_DURATION_S,
  COLUMN_SNAP_STAGGER_CAP,
  COLUMN_SNAP_STAGGER_S,
  columnSnapTransition,
} from './column-snap';

describe('columnSnapTransition', () => {
  it('uses the subtle duration and staggers only the first visible rows', () => {
    expect(columnSnapTransition(0).layout).toEqual({
      duration: COLUMN_SNAP_DURATION_S,
      ease: 'easeOut',
      delay: 0,
    });
    expect(columnSnapTransition(3).layout.delay).toBe(
      3 * COLUMN_SNAP_STAGGER_S
    );
    expect(columnSnapTransition(COLUMN_SNAP_STAGGER_CAP).layout.delay).toBe(
      COLUMN_SNAP_STAGGER_CAP * COLUMN_SNAP_STAGGER_S
    );
    expect(columnSnapTransition(40).layout.delay).toBe(
      columnSnapTransition(COLUMN_SNAP_STAGGER_CAP).layout.delay
    );
    expect(columnSnapTransition(-2).layout.delay).toBe(0);
  });
});
