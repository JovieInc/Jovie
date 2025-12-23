/**
 * Notification Validation Tests
 * Tests for email and phone normalization functions
 */

import { describe, expect, it } from 'vitest';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';

describe('Notification Validation', () => {
  describe('normalizeSubscriptionEmail', () => {
    it('should return null for null or undefined input', () => {
      expect(normalizeSubscriptionEmail(null)).toBeNull();
      expect(normalizeSubscriptionEmail(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(normalizeSubscriptionEmail('')).toBeNull();
      expect(normalizeSubscriptionEmail('   ')).toBeNull();
    });

    it('should trim and lowercase valid emails', () => {
      expect(normalizeSubscriptionEmail('  User@Example.COM  ')).toBe(
        'user@example.com'
      );
    });

    it('should accept valid email formats', () => {
      expect(normalizeSubscriptionEmail('user@domain.com')).toBe(
        'user@domain.com'
      );
      expect(normalizeSubscriptionEmail('user.name@domain.co.uk')).toBe(
        'user.name@domain.co.uk'
      );
      expect(normalizeSubscriptionEmail('user+tag@domain.org')).toBe(
        'user+tag@domain.org'
      );
      expect(normalizeSubscriptionEmail('user123@sub.domain.com')).toBe(
        'user123@sub.domain.com'
      );
    });

    it('should reject invalid email formats', () => {
      expect(normalizeSubscriptionEmail('invalid')).toBeNull();
      expect(normalizeSubscriptionEmail('invalid@')).toBeNull();
      expect(normalizeSubscriptionEmail('@domain.com')).toBeNull();
      expect(normalizeSubscriptionEmail('user@.com')).toBeNull();
      expect(normalizeSubscriptionEmail('user@domain')).toBeNull();
    });

    it('should reject emails exceeding max length (254)', () => {
      const longEmail = 'a'.repeat(250) + '@x.com';
      expect(normalizeSubscriptionEmail(longEmail)).toBeNull();
    });

    it('should reject emails with control characters', () => {
      expect(normalizeSubscriptionEmail('user\u0000@domain.com')).toBeNull();
      expect(normalizeSubscriptionEmail('user\u001F@domain.com')).toBeNull();
      expect(normalizeSubscriptionEmail('user\u007F@domain.com')).toBeNull();
    });

    it('should reject emails with whitespace in the middle', () => {
      expect(normalizeSubscriptionEmail('user @domain.com')).toBeNull();
      expect(normalizeSubscriptionEmail('user@ domain.com')).toBeNull();
      expect(normalizeSubscriptionEmail('user\t@domain.com')).toBeNull();
    });
  });

  describe('normalizeSubscriptionPhone', () => {
    it('should return null for null or undefined input', () => {
      expect(normalizeSubscriptionPhone(null)).toBeNull();
      expect(normalizeSubscriptionPhone(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(normalizeSubscriptionPhone('')).toBeNull();
      expect(normalizeSubscriptionPhone('   ')).toBeNull();
    });

    it('should normalize phone numbers with + prefix', () => {
      expect(normalizeSubscriptionPhone('+1234567890')).toBe('+1234567890');
      expect(normalizeSubscriptionPhone('+14155551234')).toBe('+14155551234');
    });

    it('should add + prefix if missing', () => {
      expect(normalizeSubscriptionPhone('1234567890')).toBe('+1234567890');
      expect(normalizeSubscriptionPhone('14155551234')).toBe('+14155551234');
    });

    it('should convert 00 prefix to +', () => {
      expect(normalizeSubscriptionPhone('001234567890')).toBe('+1234567890');
      expect(normalizeSubscriptionPhone('0044123456789')).toBe('+44123456789');
    });

    it('should remove formatting characters', () => {
      expect(normalizeSubscriptionPhone('+1-415-555-1234')).toBe(
        '+14155551234'
      );
      expect(normalizeSubscriptionPhone('+1 (415) 555-1234')).toBe(
        '+14155551234'
      );
      expect(normalizeSubscriptionPhone('+1.415.555.1234')).toBe(
        '+14155551234'
      );
    });

    it('should reject phone numbers that are too short', () => {
      expect(normalizeSubscriptionPhone('+12345')).toBeNull(); // Less than 7 digits
      expect(normalizeSubscriptionPhone('12345')).toBeNull();
    });

    it('should reject phone numbers that are too long', () => {
      expect(normalizeSubscriptionPhone('+123456789012345678')).toBeNull(); // More than 15 digits
    });

    it('should reject phone numbers starting with 0 after +', () => {
      expect(normalizeSubscriptionPhone('+0234567890')).toBeNull();
    });

    it('should handle international formats', () => {
      expect(normalizeSubscriptionPhone('+447911123456')).toBe('+447911123456'); // UK
      expect(normalizeSubscriptionPhone('+33612345678')).toBe('+33612345678'); // France
      expect(normalizeSubscriptionPhone('+8613812345678')).toBe(
        '+8613812345678'
      ); // China
    });

    it('should reject input exceeding max length before normalization (32)', () => {
      const longPhone = '+1' + '2'.repeat(35);
      expect(normalizeSubscriptionPhone(longPhone)).toBeNull();
    });

    it('should handle trimming', () => {
      expect(normalizeSubscriptionPhone('  +14155551234  ')).toBe(
        '+14155551234'
      );
    });
  });
});
