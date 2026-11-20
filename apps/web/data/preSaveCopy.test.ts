import { describe, expect, it } from 'vitest';
import { getPreSaveReleaseAt } from '@/data/preSaveCopy';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('getPreSaveReleaseAt', () => {
  it.each([
    '2026-10-29T00:00:01.000Z',
    '2026-10-29T17:00:00.000Z',
    '2031-04-16T16:00:00.000Z',
  ])(
    'keeps the demo countdown under 60 days (and in the future) at %s',
    iso => {
      const now = new Date(iso);
      const daysAway =
        (Date.parse(getPreSaveReleaseAt(now)) - now.getTime()) / DAY_MS;

      expect(daysAway).toBeGreaterThan(0);
      expect(daysAway).toBeLessThan(60);
    }
  );
});
