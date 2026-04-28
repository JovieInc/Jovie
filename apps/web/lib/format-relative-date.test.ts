import { describe, expect, it } from 'vitest';
import { relativeDate } from './format-relative-date';

const NOW = new Date('2026-04-25T12:00:00Z');

describe('relativeDate', () => {
  it('returns "Today" for the same calendar day', () => {
    expect(relativeDate('2026-04-25T18:00:00Z', NOW)).toBe('Today');
  });

  it('returns "Yesterday" / "Tomorrow" for ±1 day', () => {
    expect(relativeDate('2026-04-24T12:00:00Z', NOW)).toBe('Yesterday');
    expect(relativeDate('2026-04-26T12:00:00Z', NOW)).toBe('Tomorrow');
  });

  it('formats short past inside a week as "Nd ago"', () => {
    expect(relativeDate('2026-04-22T12:00:00Z', NOW)).toBe('3d ago');
    expect(relativeDate('2026-04-18T12:00:00Z', NOW)).toBe('7d ago');
  });

  it('formats short future inside a week as "in Nd"', () => {
    expect(relativeDate('2026-04-28T12:00:00Z', NOW)).toBe('in 3d');
    expect(relativeDate('2026-05-02T12:00:00Z', NOW)).toBe('in 7d');
  });

  it('falls back to localised absolute date past a week', () => {
    const out = relativeDate('2026-06-01T12:00:00Z', NOW);
    expect(out).toMatch(/Jun/);
  });

  it('returns an empty string for invalid date input', () => {
    expect(relativeDate('not-a-date', NOW)).toBe('');
  });
});
