import { describe, expect, it } from 'vitest';
import { capitalizeFirst } from '@/lib/utils/string-utils';

describe('capitalizeFirst', () => {
  it('capitalizes the first letter of a lowercase string', () => {
    expect(capitalizeFirst('hello')).toBe('Hello');
  });

  it('returns empty string for null', () => {
    expect(capitalizeFirst(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(capitalizeFirst(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(capitalizeFirst('')).toBe('');
  });

  it('preserves already capitalized strings', () => {
    expect(capitalizeFirst('Hello')).toBe('Hello');
  });

  it('handles single character', () => {
    expect(capitalizeFirst('a')).toBe('A');
  });
});
