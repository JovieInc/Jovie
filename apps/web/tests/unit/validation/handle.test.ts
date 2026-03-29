import { describe, expect, it } from 'vitest';
import { hasOnlyLowercaseLettersNumbersAndHyphens } from '@/lib/validation/handle';

describe('hasOnlyLowercaseLettersNumbersAndHyphens', () => {
  it('returns true for valid handles', () => {
    expect(hasOnlyLowercaseLettersNumbersAndHyphens('artist-123')).toBe(true);
  });

  it('returns false for invalid runtime input', () => {
    expect(
      hasOnlyLowercaseLettersNumbersAndHyphens(null as unknown as string)
    ).toBe(false);
    expect(
      hasOnlyLowercaseLettersNumbersAndHyphens(undefined as unknown as string)
    ).toBe(false);
  });

  it('returns false for unsupported characters', () => {
    expect(hasOnlyLowercaseLettersNumbersAndHyphens('artist_name')).toBe(false);
    expect(hasOnlyLowercaseLettersNumbersAndHyphens('artist😀')).toBe(false);
  });
});
