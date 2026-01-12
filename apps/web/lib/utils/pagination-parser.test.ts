import { describe, expect, it } from 'vitest';
import { parsePaginationParams } from './pagination-parser';

describe('parsePaginationParams', () => {
  describe('valid parameters', () => {
    it('should parse valid page and pageSize', () => {
      const result = parsePaginationParams({ page: '2', pageSize: '50' });
      expect(result).toEqual({ page: 2, pageSize: 50 });
    });

    it('should handle page 1', () => {
      const result = parsePaginationParams({ page: '1', pageSize: '20' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should handle maximum page size of 100', () => {
      const result = parsePaginationParams({ page: '1', pageSize: '100' });
      expect(result).toEqual({ page: 1, pageSize: 100 });
    });

    it('should handle large page numbers', () => {
      const result = parsePaginationParams({ page: '999', pageSize: '20' });
      expect(result).toEqual({ page: 999, pageSize: 20 });
    });
  });

  describe('default values', () => {
    it('should return defaults when no params provided', () => {
      const result = parsePaginationParams();
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should return defaults when empty object provided', () => {
      const result = parsePaginationParams({});
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should use default page when only pageSize provided', () => {
      const result = parsePaginationParams({ pageSize: '50' });
      expect(result).toEqual({ page: 1, pageSize: 50 });
    });

    it('should use default pageSize when only page provided', () => {
      const result = parsePaginationParams({ page: '5' });
      expect(result).toEqual({ page: 5, pageSize: 20 });
    });
  });

  describe('invalid page parameters', () => {
    it('should default to page 1 for negative page', () => {
      const result = parsePaginationParams({ page: '-1', pageSize: '20' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should default to page 1 for zero page', () => {
      const result = parsePaginationParams({ page: '0', pageSize: '20' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should default to page 1 for non-numeric page', () => {
      const result = parsePaginationParams({ page: 'abc', pageSize: '20' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should default to page 1 for NaN page', () => {
      const result = parsePaginationParams({ page: 'NaN', pageSize: '20' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should default to page 1 for Infinity', () => {
      const result = parsePaginationParams({
        page: 'Infinity',
        pageSize: '20',
      });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should truncate float to integer for page', () => {
      const result = parsePaginationParams({ page: '2.5', pageSize: '20' });
      expect(result).toEqual({ page: 2, pageSize: 20 });
    });
  });

  describe('invalid pageSize parameters', () => {
    it('should default to pageSize 20 for negative pageSize', () => {
      const result = parsePaginationParams({ page: '1', pageSize: '-10' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should default to pageSize 20 for zero pageSize', () => {
      const result = parsePaginationParams({ page: '1', pageSize: '0' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should cap pageSize at 100 when exceeding maximum', () => {
      const result = parsePaginationParams({ page: '1', pageSize: '150' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should default to pageSize 20 for non-numeric pageSize', () => {
      const result = parsePaginationParams({ page: '1', pageSize: 'large' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should default to pageSize 20 for NaN pageSize', () => {
      const result = parsePaginationParams({ page: '1', pageSize: 'NaN' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should default to pageSize 20 for Infinity pageSize', () => {
      const result = parsePaginationParams({
        page: '1',
        pageSize: 'Infinity',
      });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });
  });

  describe('edge cases', () => {
    it('should handle undefined values in params', () => {
      const result = parsePaginationParams({
        page: undefined,
        pageSize: undefined,
      });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should handle empty string values', () => {
      const result = parsePaginationParams({ page: '', pageSize: '' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should handle whitespace strings', () => {
      const result = parsePaginationParams({ page: '  ', pageSize: '  ' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should handle both invalid params', () => {
      const result = parsePaginationParams({ page: 'bad', pageSize: 'bad' });
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should parse page with leading zeros', () => {
      const result = parsePaginationParams({ page: '005', pageSize: '20' });
      expect(result).toEqual({ page: 5, pageSize: 20 });
    });

    it('should parse pageSize with leading zeros', () => {
      const result = parsePaginationParams({ page: '1', pageSize: '050' });
      expect(result).toEqual({ page: 1, pageSize: 50 });
    });
  });
});
