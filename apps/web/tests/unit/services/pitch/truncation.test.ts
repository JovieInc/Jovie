import { describe, expect, it } from 'vitest';
import { truncateToLimit } from '@/lib/services/pitch/pitch-generator';

describe('truncateToLimit', () => {
  it('returns text unchanged when under limit', () => {
    expect(truncateToLimit('Short text', 500)).toBe('Short text');
  });

  it('returns text unchanged when exactly at limit', () => {
    const text = 'a'.repeat(500);
    expect(truncateToLimit(text, 500)).toBe(text);
  });

  it('truncates at sentence boundary when available', () => {
    const text =
      'First sentence. Second sentence. Third sentence that goes over the limit by quite a bit.';
    const result = truncateToLimit(text, 50);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result).toContain('First sentence.');
  });

  it('hard-slices when no sentence boundary in second half', () => {
    const text = 'a'.repeat(600);
    const result = truncateToLimit(text, 500);
    expect(result.length).toBe(500);
  });

  it('handles text with no punctuation', () => {
    const text = 'word '.repeat(200);
    const result = truncateToLimit(text, 100);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('handles single long sentence exceeding limit', () => {
    const text =
      'This is one very long sentence that goes on and on without any period or other sentence-ending punctuation until it exceeds the character limit significantly which means there is no good boundary to truncate at';
    const result = truncateToLimit(text, 100);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it('prefers exclamation mark boundaries', () => {
    const text =
      'Wow this is amazing! Here is more text that pushes us over the character limit for sure.';
    const result = truncateToLimit(text, 50);
    expect(result).toBe('Wow this is amazing!');
  });

  it('prefers question mark boundaries', () => {
    const text =
      'Did you hear the news? Here is more text that pushes us over the character limit for sure.';
    const result = truncateToLimit(text, 50);
    expect(result).toBe('Did you hear the news?');
  });
});
