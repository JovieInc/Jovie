/**
 * Suppression Service Tests
 * Tests for email suppression functionality
 */

import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the database
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      emailSuppressions: {
        findFirst: vi.fn(),
      },
      categorySubscriptions: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'new-suppression-id' }]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'deleted-id' }]),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    }),
  },
}));

import { db } from '@/lib/db';
import {
  addSuppression,
  getSuppressionStats,
  hashEmail,
  isCategorySuppressed,
  isEmailSuppressed,
  removeSuppression,
} from '@/lib/notifications/suppression';

describe('Suppression Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hashEmail', () => {
    it('should hash email to SHA-256 hex string', () => {
      const email = 'test@example.com';
      const expected = createHash('sha256')
        .update(email.toLowerCase().trim())
        .digest('hex');

      expect(hashEmail(email)).toBe(expected);
    });

    it('should normalize email to lowercase before hashing', () => {
      const email1 = 'Test@Example.COM';
      const email2 = 'test@example.com';

      expect(hashEmail(email1)).toBe(hashEmail(email2));
    });

    it('should trim whitespace before hashing', () => {
      const email1 = '  test@example.com  ';
      const email2 = 'test@example.com';

      expect(hashEmail(email1)).toBe(hashEmail(email2));
    });

    it('should produce 64 character hex string', () => {
      const hash = hashEmail('test@example.com');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('isEmailSuppressed', () => {
    it('should return suppressed=false when no suppression exists', async () => {
      vi.mocked(db.query.emailSuppressions.findFirst).mockResolvedValue(
        undefined
      );

      const result = await isEmailSuppressed('test@example.com');

      expect(result.suppressed).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('should return suppression details when email is suppressed', async () => {
      vi.mocked(db.query.emailSuppressions.findFirst).mockResolvedValue({
        id: 'suppression-1',
        emailHash: 'hash',
        reason: 'hard_bounce',
        source: 'webhook',
        sourceEventId: 'event-1',
        metadata: { bounceCode: '550' },
        expiresAt: null,
        createdBy: null,
        createdAt: new Date(),
      });

      const result = await isEmailSuppressed('test@example.com');

      expect(result.suppressed).toBe(true);
      expect(result.reason).toBe('hard_bounce');
      expect(result.source).toBe('webhook');
    });

    it('should check for non-expired suppressions', async () => {
      const futureDate = new Date(Date.now() + 86400000); // Tomorrow
      vi.mocked(db.query.emailSuppressions.findFirst).mockResolvedValue({
        id: 'suppression-1',
        emailHash: 'hash',
        reason: 'soft_bounce',
        source: 'webhook',
        sourceEventId: 'event-1',
        metadata: {},
        expiresAt: futureDate,
        createdBy: null,
        createdAt: new Date(),
      });

      const result = await isEmailSuppressed('test@example.com');

      expect(result.suppressed).toBe(true);
      expect(result.expiresAt).toEqual(futureDate);
    });

    it('should query database with hashed email', async () => {
      vi.mocked(db.query.emailSuppressions.findFirst).mockResolvedValue(
        undefined
      );

      await isEmailSuppressed('TEST@Example.com');

      expect(db.query.emailSuppressions.findFirst).toHaveBeenCalled();
    });
  });

  describe('isCategorySuppressed', () => {
    it('should return false when no category subscription exists', async () => {
      vi.mocked(db.query.categorySubscriptions.findFirst).mockResolvedValue(
        undefined
      );

      const result = await isCategorySuppressed(
        'test@example.com',
        'all_artists'
      );

      expect(result).toBe(false);
    });

    it('should return false when subscribed to category', async () => {
      vi.mocked(db.query.categorySubscriptions.findFirst).mockResolvedValue({
        id: 'sub-1',
        emailHash: 'hash',
        categoryKey: 'all_artists',
        subscribed: true,
        preferences: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await isCategorySuppressed(
        'test@example.com',
        'all_artists'
      );

      expect(result).toBe(false);
    });

    it('should return true when unsubscribed from category', async () => {
      vi.mocked(db.query.categorySubscriptions.findFirst).mockResolvedValue({
        id: 'sub-1',
        emailHash: 'hash',
        categoryKey: 'all_artists',
        subscribed: false,
        preferences: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await isCategorySuppressed(
        'test@example.com',
        'all_artists'
      );

      expect(result).toBe(true);
    });
  });

  describe('addSuppression', () => {
    it('should add suppression and return success', async () => {
      const result = await addSuppression(
        'test@example.com',
        'hard_bounce',
        'webhook',
        {
          sourceEventId: 'event-123',
          metadata: { bounceCode: '550' },
        }
      );

      expect(result.success).toBe(true);
      expect(result.id).toBe('new-suppression-id');
    });

    it('should handle already existing suppression', async () => {
      // Mock returning empty array (conflict - row exists)
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await addSuppression(
        'test@example.com',
        'hard_bounce',
        'webhook'
      );

      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);
    });

    it('should handle database errors', async () => {
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('DB error')),
          }),
        }),
      } as never);

      const result = await addSuppression(
        'test@example.com',
        'hard_bounce',
        'webhook'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB error');
    });
  });

  describe('removeSuppression', () => {
    it('should remove suppression and return true', async () => {
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'deleted-id' }]),
        }),
      } as never);

      const result = await removeSuppression(
        'test@example.com',
        'user_request'
      );

      expect(result).toBe(true);
    });

    it('should return false when suppression not found', async () => {
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const result = await removeSuppression(
        'test@example.com',
        'user_request'
      );

      expect(result).toBe(false);
    });
  });

  describe('getSuppressionStats', () => {
    it('should return counts by reason', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi
          .fn()
          .mockResolvedValue([
            { reason: 'hard_bounce' },
            { reason: 'hard_bounce' },
            { reason: 'spam_complaint' },
            { reason: 'user_request' },
          ]),
      } as never);

      const stats = await getSuppressionStats();

      expect(stats.hard_bounce).toBe(2);
      expect(stats.spam_complaint).toBe(1);
      expect(stats.user_request).toBe(1);
      expect(stats.soft_bounce).toBe(0);
    });

    it('should return zero counts when no suppressions', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([]),
      } as never);

      const stats = await getSuppressionStats();

      expect(stats.hard_bounce).toBe(0);
      expect(stats.soft_bounce).toBe(0);
      expect(stats.spam_complaint).toBe(0);
      expect(stats.invalid_address).toBe(0);
      expect(stats.user_request).toBe(0);
      expect(stats.abuse).toBe(0);
      expect(stats.legal).toBe(0);
    });
  });
});
