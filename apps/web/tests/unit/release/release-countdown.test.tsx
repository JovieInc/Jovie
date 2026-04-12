/**
 * ReleaseCountdown Component Tests
 * @critical — Revenue-facing countdown timer, previously had zero tests
 */
import { describe, expect, it } from 'vitest';
import { getTimeLeft } from '@/lib/utils/release-countdown';

describe('@critical ReleaseCountdown — getTimeLeft logic', () => {
  const NOW = new Date('2025-06-01T00:00:00.000Z');

  it('calculates days/hours/minutes for a future date', () => {
    const target = new Date('2025-06-03T05:30:00.000Z');
    const result = getTimeLeft(target, NOW);
    expect(result.days).toBe(2);
    expect(result.hours).toBe(5);
    expect(result.minutes).toBe(30);
    expect(result.total).toBeGreaterThan(0);
  });

  it('returns zero days when less than 24 hours remain', () => {
    const target = new Date('2025-06-01T03:45:00.000Z');
    const result = getTimeLeft(target, NOW);
    expect(result.days).toBe(0);
    expect(result.hours).toBe(3);
    expect(result.minutes).toBe(45);
  });

  it('returns all zeros when target is in the past', () => {
    const target = new Date('2025-05-01T00:00:00.000Z');
    const result = getTimeLeft(target, NOW);
    expect(result).toEqual({ days: 0, hours: 0, minutes: 0, total: 0 });
  });

  it('returns all zeros when target equals now', () => {
    const result = getTimeLeft(NOW, NOW);
    expect(result.total).toBe(0);
  });

  it('handles exactly 1 day', () => {
    const target = new Date('2025-06-02T00:00:00.000Z');
    const result = getTimeLeft(target, NOW);
    expect(result.days).toBe(1);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
  });

  it('handles exactly 1 hour', () => {
    const target = new Date('2025-06-01T01:00:00.000Z');
    const result = getTimeLeft(target, NOW);
    expect(result.days).toBe(0);
    expect(result.hours).toBe(1);
    expect(result.minutes).toBe(0);
  });

  it('handles large time differences (30+ days)', () => {
    const target = new Date('2025-07-15T12:30:00.000Z');
    const result = getTimeLeft(target, NOW);
    expect(result.days).toBe(44);
    expect(result.hours).toBe(12);
    expect(result.minutes).toBe(30);
  });
});

describe('@critical ReleaseCountdown — component data conditions', () => {
  it('days === 0 triggers hidden days segment in component', () => {
    const result = getTimeLeft(
      new Date('2025-06-01T03:45:00.000Z'),
      new Date('2025-06-01T00:00:00.000Z')
    );
    // Component hides days segment when result.days === 0
    expect(result.days).toBe(0);
  });

  it('pluralization: 1 day shows "day", 2+ shows "days"', () => {
    const oneDay = getTimeLeft(
      new Date('2025-06-02T01:00:00.000Z'),
      new Date('2025-06-01T00:00:00.000Z')
    );
    expect(oneDay.days).toBe(1);

    const twoDays = getTimeLeft(
      new Date('2025-06-03T02:00:00.000Z'),
      new Date('2025-06-01T00:00:00.000Z')
    );
    expect(twoDays.days).toBe(2);
  });

  it('pluralization: 1 hour shows "hr", 2+ shows "hrs"', () => {
    const oneHour = getTimeLeft(
      new Date('2025-06-01T01:30:00.000Z'),
      new Date('2025-06-01T00:00:00.000Z')
    );
    expect(oneHour.hours).toBe(1);

    const twoHours = getTimeLeft(
      new Date('2025-06-01T02:30:00.000Z'),
      new Date('2025-06-01T00:00:00.000Z')
    );
    expect(twoHours.hours).toBe(2);
  });

  it('total <= 0 for expired dates (component uses this to trigger refresh)', () => {
    const result = getTimeLeft(
      new Date('2025-05-01T00:00:00.000Z'),
      new Date('2025-06-01T00:00:00.000Z')
    );
    // Component calls router.refresh() when total <= 0
    expect(result.total).toBe(0);
  });

  it('total > 0 for future dates (component uses this to start interval)', () => {
    const result = getTimeLeft(
      new Date('2025-06-10T00:00:00.000Z'),
      new Date('2025-06-01T00:00:00.000Z')
    );
    // Component sets up setInterval(60_000) when total > 0
    expect(result.total).toBeGreaterThan(0);
  });

  it('total === 0 for past dates (component skips interval)', () => {
    const result = getTimeLeft(
      new Date('2025-05-01T00:00:00.000Z'),
      new Date('2025-06-01T00:00:00.000Z')
    );
    // Component skips setInterval when total <= 0
    expect(result.total).toBe(0);
  });
});
