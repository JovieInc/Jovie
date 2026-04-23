import { describe, expect, it } from 'vitest';
import { normalizeTaskText } from '@/lib/release-tasks/normalize-task-text';

describe('normalizeTaskText', () => {
  it('lowercases and trims', () => {
    expect(normalizeTaskText('  Pitch Spotify  ')).toBe('pitch spotify');
  });

  it('collapses runs of whitespace', () => {
    expect(normalizeTaskText('pitch   spotify\n\neditorial')).toBe(
      'pitch spotify editorial'
    );
  });

  it('strips punctuation except & and -', () => {
    expect(normalizeTaskText('Pitch R&B, radio-edit!')).toBe(
      'pitch r&b radio-edit'
    );
  });

  it('preserves unicode letters and numbers', () => {
    expect(normalizeTaskText('Pitch París 2026')).toBe('pitch parís 2026');
  });

  it('returns empty for empty input', () => {
    expect(normalizeTaskText('')).toBe('');
  });

  it('is deterministic', () => {
    const a = normalizeTaskText('Submit Genius!!! Lyrics');
    const b = normalizeTaskText('Submit Genius!!! Lyrics');
    expect(a).toBe(b);
    expect(a).toBe('submit genius lyrics');
  });
});
