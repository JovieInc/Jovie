import { describe, expect, it } from 'vitest';
import {
  normalizeTerritories,
  sanitizeContactInput,
  validateEmail,
} from '@/lib/contacts/validation';

describe('normalizeTerritories', () => {
  it('keeps Worldwide exclusive and deduplicates', () => {
    const result = normalizeTerritories([
      'Worldwide',
      'North America',
      'Worldwide',
      '  Europe (ex-UK) ',
    ]);

    expect(result).toEqual(['Worldwide']);
  });

  it('removes blanks and trims whitespace', () => {
    const result = normalizeTerritories(['  USA', 'Canada', ' ', 'USA  ']);
    expect(result).toEqual(['USA', 'Canada']);
  });
});

describe('sanitizeContactInput', () => {
  it('normalizes preferred channel when only one channel exists', () => {
    const sanitized = sanitizeContactInput({
      profileId: 'profile-123',
      id: 'contact-1',
      role: 'bookings',
      territories: [],
      email: 'agent@example.com',
      phone: null,
    });

    expect(sanitized.preferredChannel).toBe('email');
  });

  it('throws when no channels are provided', () => {
    expect(() =>
      sanitizeContactInput({
        profileId: 'profile-123',
        id: 'contact-1',
        role: 'bookings',
        territories: [],
        email: null,
        phone: null,
      })
    ).toThrowError(/Add at least one contact channel/);
  });
});

describe('validateEmail - ReDoS Protection', () => {
  it('rejects emails longer than 254 characters (RFC 5321 limit)', () => {
    // Create an email that exceeds the 254 character limit
    const longLocalPart = 'a'.repeat(240);
    const longEmail = `${longLocalPart}@example.com`; // 252 chars total
    const tooLongEmail = `${longLocalPart}@verylongdomain.com`; // 264 chars total

    // Email under the limit should work
    expect(() => validateEmail(longEmail)).not.toThrow();

    // Email over the limit should throw
    expect(() => validateEmail(tooLongEmail)).toThrowError(/too long/);
  });

  it('validates normal emails correctly', () => {
    expect(validateEmail('user@example.com')).toBe('user@example.com');
    expect(validateEmail('test.email+tag@domain.co.uk')).toBe(
      'test.email+tag@domain.co.uk'
    );
    expect(validateEmail('  user@example.com  ')).toBe('user@example.com');
  });

  it('rejects invalid email formats', () => {
    expect(() => validateEmail('not-an-email')).toThrowError(/valid email/);
    expect(() => validateEmail('@example.com')).toThrowError(/valid email/);
    expect(() => validateEmail('user@')).toThrowError(/valid email/);
    expect(() => validateEmail('user@.com')).toThrowError(/valid email/);
  });

  it('handles null and empty values', () => {
    expect(validateEmail(null)).toBe(null);
    expect(validateEmail(undefined)).toBe(null);
    expect(validateEmail('')).toBe(null);
    expect(validateEmail('   ')).toBe(null);
  });

  it('performs efficiently on malicious input patterns', () => {
    // Test that the regex doesn't cause catastrophic backtracking
    // These patterns could be problematic with vulnerable regexes
    const maliciousPatterns = [
      'a'.repeat(100) + '@' + 'b'.repeat(100) + '.com',
      'user@' + 'subdomain.'.repeat(20) + 'com',
    ];

    const start = Date.now();
    maliciousPatterns.forEach(pattern => {
      try {
        validateEmail(pattern);
      } catch {
        // We expect these to fail validation, but quickly
      }
    });
    const duration = Date.now() - start;

    // Should complete in under 100ms even with malicious patterns
    expect(duration).toBeLessThan(100);
  });
});
