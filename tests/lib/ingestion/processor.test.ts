import { describe, expect, it, vi } from 'vitest';
import { ExtractionError } from '@/lib/ingestion/strategies/base';

// Mock the strategies
vi.mock('@/lib/ingestion/strategies/linktree', () => ({
  fetchLinktreeDocument: vi.fn(),
  extractLinktree: vi.fn(),
}));

vi.mock('@/lib/ingestion/strategies/beacons', () => ({
  fetchBeaconsDocument: vi.fn(),
  extractBeacons: vi.fn(),
}));

describe('Ingestion Processor', () => {
  describe('ExtractionError handling', () => {
    it('creates error with correct properties', () => {
      const error = new ExtractionError('Test error', 'NOT_FOUND', 404);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('ExtractionError');
    });

    it('preserves cause when provided', () => {
      const cause = new Error('Original error');
      const error = new ExtractionError(
        'Wrapped error',
        'FETCH_FAILED',
        undefined,
        cause
      );

      expect(error.cause).toBe(cause);
    });

    it('has correct error codes for different scenarios', () => {
      const notFound = new ExtractionError('Not found', 'NOT_FOUND', 404);
      const rateLimited = new ExtractionError(
        'Rate limited',
        'RATE_LIMITED',
        429
      );
      const timeout = new ExtractionError('Timeout', 'FETCH_TIMEOUT');
      const empty = new ExtractionError('Empty', 'EMPTY_RESPONSE');
      const invalid = new ExtractionError('Invalid', 'INVALID_URL');
      const failed = new ExtractionError('Failed', 'FETCH_FAILED', 500);

      expect(notFound.code).toBe('NOT_FOUND');
      expect(rateLimited.code).toBe('RATE_LIMITED');
      expect(timeout.code).toBe('FETCH_TIMEOUT');
      expect(empty.code).toBe('EMPTY_RESPONSE');
      expect(invalid.code).toBe('INVALID_URL');
      expect(failed.code).toBe('FETCH_FAILED');
    });
  });

  describe('Error code to HTTP status mapping', () => {
    it('maps error codes to appropriate HTTP statuses', () => {
      const statusMap: Record<string, number> = {
        NOT_FOUND: 404,
        RATE_LIMITED: 429,
        FETCH_TIMEOUT: 504,
        INVALID_URL: 400,
        EMPTY_RESPONSE: 502,
        FETCH_FAILED: 502,
      };

      for (const [code, expectedStatus] of Object.entries(statusMap)) {
        const error = new ExtractionError(
          'Test',
          code as 'NOT_FOUND',
          expectedStatus
        );
        expect(error.statusCode).toBe(expectedStatus);
      }
    });
  });
});
