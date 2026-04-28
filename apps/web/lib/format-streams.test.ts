import { describe, expect, it } from 'vitest';
import { formatStreams } from './format-streams';

describe('formatStreams', () => {
  it('returns the bare integer under 1000', () => {
    expect(formatStreams(0)).toBe('0');
    expect(formatStreams(842)).toBe('842');
    expect(formatStreams(999)).toBe('999');
  });

  it('formats thousands with K suffix to one decimal', () => {
    expect(formatStreams(1000)).toBe('1.0K');
    expect(formatStreams(1234)).toBe('1.2K');
    expect(formatStreams(45_678)).toBe('45.7K');
    expect(formatStreams(999_999)).toBe('1000.0K');
  });

  it('formats millions with M suffix to one decimal', () => {
    expect(formatStreams(1_000_000)).toBe('1.0M');
    expect(formatStreams(1_234_567)).toBe('1.2M');
    expect(formatStreams(45_678_901)).toBe('45.7M');
  });

  it('returns 0 for non-finite or negative input', () => {
    expect(formatStreams(Number.NaN)).toBe('0');
    expect(formatStreams(Number.POSITIVE_INFINITY)).toBe('0');
    expect(formatStreams(-100)).toBe('0');
  });
});
