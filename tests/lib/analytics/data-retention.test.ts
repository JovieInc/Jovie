/**
 * Data Retention Tests
 * Validates data retention cleanup functionality
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRetentionCutoffDate,
  getRetentionDays,
} from '@/lib/analytics/data-retention';

// Mock the database to prevent actual DB operations
vi.mock('@/lib/db', () => ({
  db: {
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ count: 0 }])),
      })),
    })),
    execute: vi.fn(() => Promise.resolve({ rows: [] })),
  },
}));

describe('Data Retention', () => {
  describe('getRetentionDays', () => {
    beforeEach(() => {
      delete process.env.ANALYTICS_RETENTION_DAYS;
    });

    it('should return default 90 days when not configured', () => {
      expect(getRetentionDays()).toBe(90);
    });

    it('should return configured value when set', () => {
      process.env.ANALYTICS_RETENTION_DAYS = '30';

      expect(getRetentionDays()).toBe(30);

      delete process.env.ANALYTICS_RETENTION_DAYS;
    });

    it('should return default for invalid values', () => {
      process.env.ANALYTICS_RETENTION_DAYS = 'invalid';
      expect(getRetentionDays()).toBe(90);

      process.env.ANALYTICS_RETENTION_DAYS = '-5';
      expect(getRetentionDays()).toBe(90);

      process.env.ANALYTICS_RETENTION_DAYS = '0';
      expect(getRetentionDays()).toBe(90);

      delete process.env.ANALYTICS_RETENTION_DAYS;
    });

    it('should accept custom retention periods', () => {
      process.env.ANALYTICS_RETENTION_DAYS = '180';
      expect(getRetentionDays()).toBe(180);

      process.env.ANALYTICS_RETENTION_DAYS = '7';
      expect(getRetentionDays()).toBe(7);

      process.env.ANALYTICS_RETENTION_DAYS = '365';
      expect(getRetentionDays()).toBe(365);

      delete process.env.ANALYTICS_RETENTION_DAYS;
    });
  });

  describe('getRetentionCutoffDate', () => {
    it('should calculate correct cutoff date for default 90 days', () => {
      const now = new Date();
      const expectedCutoff = new Date(now);
      expectedCutoff.setDate(expectedCutoff.getDate() - 90);
      expectedCutoff.setHours(0, 0, 0, 0);

      const cutoff = getRetentionCutoffDate();

      expect(cutoff.getTime()).toBe(expectedCutoff.getTime());
    });

    it('should calculate correct cutoff date for custom days', () => {
      const now = new Date();
      const expectedCutoff = new Date(now);
      expectedCutoff.setDate(expectedCutoff.getDate() - 30);
      expectedCutoff.setHours(0, 0, 0, 0);

      const cutoff = getRetentionCutoffDate(30);

      expect(cutoff.getTime()).toBe(expectedCutoff.getTime());
    });

    it('should set cutoff to start of day', () => {
      const cutoff = getRetentionCutoffDate(7);

      expect(cutoff.getHours()).toBe(0);
      expect(cutoff.getMinutes()).toBe(0);
      expect(cutoff.getSeconds()).toBe(0);
      expect(cutoff.getMilliseconds()).toBe(0);
    });

    it('should handle year boundaries correctly', () => {
      // Test with 365 days retention
      const cutoff = getRetentionCutoffDate(365);

      const now = new Date();
      const expected = new Date(now);
      expected.setDate(expected.getDate() - 365);
      expected.setHours(0, 0, 0, 0);

      expect(cutoff.getTime()).toBe(expected.getTime());
    });
  });

  describe('Data retention compliance', () => {
    it('should default to GDPR-compliant retention period', () => {
      // GDPR recommends data minimization
      // 90 days is a reasonable default for analytics data
      expect(getRetentionDays()).toBeLessThanOrEqual(365);
    });

    it('should allow configurable retention for compliance needs', () => {
      // CCPA requires data deletion upon request
      // Configurable retention supports different compliance needs
      process.env.ANALYTICS_RETENTION_DAYS = '30';
      expect(getRetentionDays()).toBe(30);
      delete process.env.ANALYTICS_RETENTION_DAYS;
    });
  });
});
