import { describe, expect, it } from 'vitest';
import { calculatePagination } from '@/hooks/usePagination';

describe('calculatePagination', () => {
  describe('basic calculations', () => {
    it('should calculate correct values for first page', () => {
      const result = calculatePagination({ page: 1, pageSize: 10, total: 95 });

      expect(result.totalPages).toBe(10);
      expect(result.canPrev).toBe(false);
      expect(result.canNext).toBe(true);
      expect(result.from).toBe(1);
      expect(result.to).toBe(10);
      expect(result.offset).toBe(0);
      expect(result.isEmpty).toBe(false);
      expect(result.isFirstPage).toBe(true);
      expect(result.isLastPage).toBe(false);
    });

    it('should calculate correct values for middle page', () => {
      const result = calculatePagination({ page: 5, pageSize: 10, total: 95 });

      expect(result.totalPages).toBe(10);
      expect(result.canPrev).toBe(true);
      expect(result.canNext).toBe(true);
      expect(result.from).toBe(41);
      expect(result.to).toBe(50);
      expect(result.offset).toBe(40);
      expect(result.isFirstPage).toBe(false);
      expect(result.isLastPage).toBe(false);
    });

    it('should calculate correct values for last page', () => {
      const result = calculatePagination({
        page: 10,
        pageSize: 10,
        total: 95,
      });

      expect(result.totalPages).toBe(10);
      expect(result.canPrev).toBe(true);
      expect(result.canNext).toBe(false);
      expect(result.from).toBe(91);
      expect(result.to).toBe(95);
      expect(result.offset).toBe(90);
      expect(result.isFirstPage).toBe(false);
      expect(result.isLastPage).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty dataset', () => {
      const result = calculatePagination({ page: 1, pageSize: 10, total: 0 });

      expect(result.totalPages).toBe(1);
      expect(result.canPrev).toBe(false);
      expect(result.canNext).toBe(false);
      expect(result.from).toBe(0);
      expect(result.to).toBe(0);
      expect(result.offset).toBe(0);
      expect(result.isEmpty).toBe(true);
      expect(result.isFirstPage).toBe(true);
      expect(result.isLastPage).toBe(true);
    });

    it('should handle single item', () => {
      const result = calculatePagination({ page: 1, pageSize: 10, total: 1 });

      expect(result.totalPages).toBe(1);
      expect(result.canPrev).toBe(false);
      expect(result.canNext).toBe(false);
      expect(result.from).toBe(1);
      expect(result.to).toBe(1);
      expect(result.isEmpty).toBe(false);
    });

    it('should handle total exactly equal to page size', () => {
      const result = calculatePagination({ page: 1, pageSize: 10, total: 10 });

      expect(result.totalPages).toBe(1);
      expect(result.canPrev).toBe(false);
      expect(result.canNext).toBe(false);
      expect(result.from).toBe(1);
      expect(result.to).toBe(10);
    });

    it('should handle total one more than page size', () => {
      const result = calculatePagination({ page: 1, pageSize: 10, total: 11 });

      expect(result.totalPages).toBe(2);
      expect(result.canNext).toBe(true);
    });

    it('should handle page size of 1', () => {
      const result = calculatePagination({ page: 3, pageSize: 1, total: 5 });

      expect(result.totalPages).toBe(5);
      expect(result.from).toBe(3);
      expect(result.to).toBe(3);
      expect(result.offset).toBe(2);
      expect(result.canPrev).toBe(true);
      expect(result.canNext).toBe(true);
    });

    it('should handle large page size', () => {
      const result = calculatePagination({
        page: 1,
        pageSize: 1000,
        total: 50,
      });

      expect(result.totalPages).toBe(1);
      expect(result.from).toBe(1);
      expect(result.to).toBe(50);
      expect(result.canNext).toBe(false);
    });
  });

  describe('offset calculations', () => {
    it('should calculate correct database offset', () => {
      expect(
        calculatePagination({ page: 1, pageSize: 20, total: 100 }).offset
      ).toBe(0);
      expect(
        calculatePagination({ page: 2, pageSize: 20, total: 100 }).offset
      ).toBe(20);
      expect(
        calculatePagination({ page: 3, pageSize: 20, total: 100 }).offset
      ).toBe(40);
      expect(
        calculatePagination({ page: 5, pageSize: 20, total: 100 }).offset
      ).toBe(80);
    });
  });

  describe('from/to range', () => {
    it('should show correct "Showing X-Y of Z" values', () => {
      const result = calculatePagination({
        page: 2,
        pageSize: 25,
        total: 73,
      });

      expect(result.from).toBe(26);
      expect(result.to).toBe(50);
    });

    it('should cap "to" at total on last page', () => {
      const result = calculatePagination({
        page: 3,
        pageSize: 25,
        total: 73,
      });

      expect(result.from).toBe(51);
      expect(result.to).toBe(73);
    });
  });
});
