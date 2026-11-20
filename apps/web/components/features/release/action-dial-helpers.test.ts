import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROW_STEP_PX } from '@/lib/dial/dial-layout';
import {
  DIAL_HINT_SEEN_KEY,
  isWheelNotch,
  normalizeWheel,
  readHintSeen,
  writeHintSeen,
} from './action-dial-helpers';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('action-dial-helpers', () => {
  it('normalizes wheel deltas by deltaMode', () => {
    expect(normalizeWheel({ deltaMode: 0, deltaY: 40 } as WheelEvent)).toBe(40);
    expect(normalizeWheel({ deltaMode: 1, deltaY: 1 } as WheelEvent)).toBe(
      ROW_STEP_PX
    );
    expect(normalizeWheel({ deltaMode: 2, deltaY: 1 } as WheelEvent)).toBe(
      ROW_STEP_PX * 3
    );
  });

  it('detects discrete wheel notches', () => {
    expect(isWheelNotch({ deltaMode: 1, deltaY: 1 } as WheelEvent)).toBe(true);
    expect(isWheelNotch({ deltaMode: 0, deltaY: 120 } as WheelEvent)).toBe(
      true
    );
    expect(isWheelNotch({ deltaMode: 0, deltaY: 37 } as WheelEvent)).toBe(
      false
    );
  });

  it('reads and writes the first-use hint flag with storage failures', () => {
    expect(readHintSeen()).toBe(false);
    writeHintSeen();
    expect(localStorage.getItem(DIAL_HINT_SEEN_KEY)).toBe('1');
    expect(readHintSeen()).toBe(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readHintSeen()).toBe(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => writeHintSeen()).not.toThrow();
  });
});
