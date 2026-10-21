import { describe, expect, it } from 'vitest';
import {
  countMissedPresentationSlots,
  type RefreshProfile,
} from './chat-scroll-frames';

for (const refreshHz of [60, 120] as const) {
  describe(`${refreshHz}Hz presentation slots`, () => {
    const profile: RefreshProfile = { refreshHz, toleranceMs: 1 };
    const period = 1000 / refreshHz;
    const count = (times: number[], foreground = true) =>
      countMissedPresentationSlots({
        profile,
        samples: times.map(timestamp => ({ timestamp, foreground })),
      });
    it('accepts regular cadence with bounded scheduling noise', () => {
      expect(
        count([0, period + 0.4, 2 * period - 0.2, 3 * period]).droppedFrameCount
      ).toBe(0);
    });
    it('detects one missed frame below the old 50ms cutoff', () => {
      expect(2 * period).toBeLessThan(50);
      expect(count([0, period, 3 * period, 4 * period]).droppedFrameCount).toBe(
        1
      );
    });
    it('counts all slots lost in sustained and repeated stalls', () => {
      expect(
        count([0, 7 * period, 11 * period, 12 * period]).droppedFrameCount
      ).toBe(9);
    });
    it('tolerates bounded timestamp rounding at a missed slot', () => {
      expect(count([0, 2 * period - 0.5]).droppedFrameCount).toBe(1);
      expect(count([0, period + 0.5]).droppedFrameCount).toBe(0);
    });
    it('counts a missed deadline as soon as the bounded tolerance expires', () => {
      expect(count([0, period + 1]).droppedFrameCount).toBe(0);
      expect(count([0, period + 1.1]).droppedFrameCount).toBe(1);
      expect(count([0, 2 * period + 0.5]).droppedFrameCount).toBe(1);
    });
    it('rejects hidden/background measurements even at perfect cadence', () => {
      expect(() => count([0, period], false)).toThrow('hidden/background');
      expect(() =>
        countMissedPresentationSlots({
          profile,
          samples: [
            { timestamp: 0, foreground: true },
            { timestamp: period, foreground: false },
            { timestamp: 2 * period, foreground: true },
          ],
        })
      ).toThrow('hidden/background');
    });
    it('rejects missing, invalid and non-monotonic clocks', () => {
      for (const times of [
        [],
        [0],
        [0, 0],
        [period, 0],
        [0, NaN],
        [0, Infinity],
        [0, period / 2],
      ]) {
        expect(() => count(times)).toThrow();
      }
    });
  });
}

it('rejects unsupported refresh profiles and unbounded tolerance', () => {
  for (const profile of [
    { refreshHz: 0, toleranceMs: 1 },
    { refreshHz: 90, toleranceMs: 1 },
    { refreshHz: 60, toleranceMs: -1 },
    { refreshHz: 120, toleranceMs: 3 },
    { refreshHz: 60, toleranceMs: NaN },
  ]) {
    expect(() =>
      countMissedPresentationSlots({
        profile: profile as RefreshProfile,
        samples: [],
      })
    ).toThrow('Invalid refresh');
  }
});
