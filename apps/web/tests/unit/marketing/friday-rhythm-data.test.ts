import { describe, expect, it } from 'vitest';
import {
  countFridaysInYear,
  FRIDAY_RELEASE_KINDS,
  formatDateKey,
  generateFridayRhythmData,
  INITIAL_ACTIVE_FRIDAYS,
  isFridayDateKey,
} from '@/components/marketing/friday-rhythm-data';

describe('friday rhythm data', () => {
  it('generates every date in 2026 with exactly 3 active Fridays initially', () => {
    const data = generateFridayRhythmData(2026, INITIAL_ACTIVE_FRIDAYS);
    const activeDays = data.filter(day => day.count > 0);

    expect(data).toHaveLength(365);
    expect(data.at(0)?.date).toBe('2026-01-01');
    expect(data.at(-1)?.date).toBe('2026-12-31');
    expect(activeDays).toHaveLength(3);
    expect(activeDays.every(day => isFridayDateKey(day.date))).toBe(true);
  });

  it('scatters the initial 3 active Fridays across early, mid, and late 2026', () => {
    const data = generateFridayRhythmData(2026, INITIAL_ACTIVE_FRIDAYS);
    const activeDates = data.filter(day => day.count > 0).map(day => day.date);

    expect(activeDates).toEqual(['2026-02-06', '2026-07-03', '2026-11-20']);
  });

  it('fills the computed Friday total without hardcoding 52', () => {
    const totalFridays = countFridaysInYear(2026);
    const data = generateFridayRhythmData(2026, totalFridays);

    expect(totalFridays).toBe(52);
    expect(data.filter(day => day.count > 0)).toHaveLength(totalFridays);
  });

  it('assigns deterministic release categories across filled Fridays', () => {
    const data = generateFridayRhythmData(2026, countFridaysInYear(2026));
    const activeDays = data.filter(day => day.count > 0);
    const labels = new Set(activeDays.map(day => day.label));

    expect(labels).toEqual(
      new Set(FRIDAY_RELEASE_KINDS.map(kind => kind.label))
    );
    expect(activeDays.every(day => day.accentColor)).toBe(true);
  });

  it('supports a 53-Friday year', () => {
    const totalFridays = countFridaysInYear(2032);
    const data = generateFridayRhythmData(2032, totalFridays);

    expect(totalFridays).toBe(53);
    expect(data.filter(day => day.count > 0)).toHaveLength(53);
  });

  it('supports leap years without activating non-Fridays', () => {
    const data = generateFridayRhythmData(2028, countFridaysInYear(2028));

    expect(data).toHaveLength(366);
    expect(data.filter(day => day.count > 0)).toHaveLength(52);
    expect(
      data.filter(day => day.count > 0).every(day => isFridayDateKey(day.date))
    ).toBe(true);
  });

  it('clamps active Friday counts to valid bounds', () => {
    const noneActive = generateFridayRhythmData(2026, -12);
    const allActive = generateFridayRhythmData(2026, 999);

    expect(noneActive.filter(day => day.count > 0)).toHaveLength(0);
    expect(allActive.filter(day => day.count > 0)).toHaveLength(
      countFridaysInYear(2026)
    );
  });

  it('formats stable date keys without timezone conversion', () => {
    expect(formatDateKey(2026, 0, 1)).toBe('2026-01-01');
    expect(formatDateKey(2026, 11, 31)).toBe('2026-12-31');
  });
});
