/**
 * CSV Utility Tests - escapeCSVValue function
 */

import { describe, expect, it } from 'vitest';
import { escapeCSVValue } from '@/lib/utils/csv';

describe('CSV Utility - escapeCSVValue', () => {
  describe('null and undefined handling', () => {
    it('should return empty string for null', () => {
      expect(escapeCSVValue(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(escapeCSVValue(undefined)).toBe('');
    });
  });

  describe('basic value conversion', () => {
    it('should convert string to string', () => {
      expect(escapeCSVValue('hello')).toBe('hello');
    });

    it('should convert number to string', () => {
      expect(escapeCSVValue(42)).toBe('42');
      expect(escapeCSVValue(3.14)).toBe('3.14');
      expect(escapeCSVValue(-100)).toBe('-100');
    });

    it('should convert boolean to string', () => {
      expect(escapeCSVValue(true)).toBe('true');
      expect(escapeCSVValue(false)).toBe('false');
    });

    it('should convert 0 to string', () => {
      expect(escapeCSVValue(0)).toBe('0');
    });

    it('should convert empty string to empty string', () => {
      expect(escapeCSVValue('')).toBe('');
    });
  });

  describe('special character escaping', () => {
    it('should quote and escape values containing commas', () => {
      expect(escapeCSVValue('hello, world')).toBe('"hello, world"');
    });

    it('should quote and escape values containing double quotes', () => {
      expect(escapeCSVValue('say "hello"')).toBe('"say ""hello"""');
    });

    it('should quote and escape values containing newlines', () => {
      expect(escapeCSVValue('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should quote and escape values containing carriage returns', () => {
      expect(escapeCSVValue('line1\rline2')).toBe('"line1\rline2"');
    });

    it('should handle values with multiple special characters', () => {
      const value = 'He said, "Hello\nWorld"';
      expect(escapeCSVValue(value)).toBe('"He said, ""Hello\nWorld"""');
    });

    it('should not quote values without special characters', () => {
      expect(escapeCSVValue('normal text')).toBe('normal text');
    });

    it('should handle values with only double quotes correctly', () => {
      expect(escapeCSVValue('""')).toBe('""""""');
    });
  });

  describe('unicode and special characters', () => {
    it('should handle unicode characters without quoting', () => {
      expect(escapeCSVValue('日本語')).toBe('日本語');
    });

    it('should handle emojis', () => {
      expect(escapeCSVValue('Hello 👋')).toBe('Hello 👋');
    });

    it('should handle unicode with special CSV characters', () => {
      expect(escapeCSVValue('日本語, with comma')).toBe('"日本語, with comma"');
    });
  });
});
