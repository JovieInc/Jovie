/**
 * CSV Export Tests - CSV Config Integration
 */
import { configure } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import './csv-export.test-utils';

// Speed up waitFor calls with shorter timeout and interval
configure({ asyncUtilTimeout: 100 });

// Import CSV configs for admin tables
import {
  CREATORS_CSV_FILENAME_PREFIX,
  creatorsCSVColumns,
  USERS_CSV_FILENAME_PREFIX,
  usersCSVColumns,
  WAITLIST_CSV_FILENAME_PREFIX,
  waitlistCSVColumns,
} from '@/lib/admin/csv-configs';

describe('CSV Config Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Waitlist CSV Config', () => {
    it('should export waitlist columns correctly', () => {
      expect(waitlistCSVColumns).toBeDefined();
      expect(WAITLIST_CSV_FILENAME_PREFIX).toBe('waitlist');

      // Verify column structure
      const headers = waitlistCSVColumns.map(c => c.header);
      expect(headers).toContain('ID');
      expect(headers).toContain('Full Name');
      expect(headers).toContain('Email');
      expect(headers).toContain('Status');
      expect(headers).toContain('Created At');
    });

    it('should format waitlist status correctly', () => {
      const statusColumn = waitlistCSVColumns.find(c => c.header === 'Status');
      expect(statusColumn).toBeDefined();
      expect(statusColumn?.formatter).toBeDefined();
      expect(statusColumn?.formatter?.('pending', {} as never)).toBe('Pending');
    });
  });

  describe('Users CSV Config', () => {
    it('should export users columns correctly', () => {
      expect(usersCSVColumns).toBeDefined();
      expect(USERS_CSV_FILENAME_PREFIX).toBe('users');

      // Verify column structure
      const headers = usersCSVColumns.map(c => c.header);
      expect(headers).toContain('ID');
      expect(headers).toContain('Clerk ID');
      expect(headers).toContain('Name');
      expect(headers).toContain('Email');
      expect(headers).toContain('Plan');
      expect(headers).toContain('Is Pro');
    });

    it('should format isPro as Yes/No', () => {
      const isProColumn = usersCSVColumns.find(c => c.header === 'Is Pro');
      expect(isProColumn).toBeDefined();
      expect(isProColumn?.formatter).toBeDefined();
      expect(isProColumn?.formatter?.(true, {} as never)).toBe('Yes');
      expect(isProColumn?.formatter?.(false, {} as never)).toBe('No');
    });
  });

  describe('Creators CSV Config', () => {
    it('should export creators columns correctly', () => {
      expect(creatorsCSVColumns).toBeDefined();
      expect(CREATORS_CSV_FILENAME_PREFIX).toBe('creators');

      // Verify column structure
      const headers = creatorsCSVColumns.map(c => c.header);
      expect(headers).toContain('ID');
      expect(headers).toContain('Username');
      expect(headers).toContain('Display Name');
      expect(headers).toContain('Is Verified');
      expect(headers).toContain('Is Featured');
      expect(headers).toContain('Is Claimed');
    });

    it('should format boolean fields as Yes/No', () => {
      const isVerifiedColumn = creatorsCSVColumns.find(
        c => c.header === 'Is Verified'
      );
      expect(isVerifiedColumn?.formatter?.(true, {} as never)).toBe('Yes');
      expect(isVerifiedColumn?.formatter?.(false, {} as never)).toBe('No');

      const isFeaturedColumn = creatorsCSVColumns.find(
        c => c.header === 'Is Featured'
      );
      expect(isFeaturedColumn?.formatter?.(true, {} as never)).toBe('Yes');
      expect(isFeaturedColumn?.formatter?.(false, {} as never)).toBe('No');
    });

    it('should format confidence as percentage', () => {
      const confidenceColumn = creatorsCSVColumns.find(
        c => c.header === 'Confidence'
      );
      expect(confidenceColumn).toBeDefined();
      expect(confidenceColumn?.formatter?.(0.95, {} as never)).toBe('95.0%');
      expect(confidenceColumn?.formatter?.(0.5, {} as never)).toBe('50.0%');
      expect(confidenceColumn?.formatter?.(null, {} as never)).toBe('');
    });
  });
});
