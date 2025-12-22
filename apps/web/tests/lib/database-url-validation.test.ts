import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Test the DATABASE_URL validator directly (extracted from lib/env.ts)
const databaseUrlValidator = z
  .string()
  .optional()
  .refine(
    url => {
      if (!url) return true; // Allow empty during build time

      try {
        const parsed = new URL(url);

        // Validate protocol
        const validProtocols = [
          'postgres:',
          'postgresql:',
          'postgres+tcp:',
          'postgresql+tcp:',
        ];
        if (!validProtocols.includes(parsed.protocol)) {
          return false;
        }

        // Validate hostname
        if (!parsed.hostname) {
          return false;
        }

        // Validate database name (pathname should exist and not be just '/')
        if (!parsed.pathname || parsed.pathname === '/') {
          return false;
        }

        return true;
      } catch {
        return false;
      }
    },
    {
      message:
        'DATABASE_URL must be a valid PostgreSQL connection string (postgres://user:pass@host:port/dbname)',
    }
  );

describe('DATABASE_URL Validation', () => {
  describe('Valid DATABASE_URLs', () => {
    const validUrls = [
      'postgres://user:pass@localhost:5432/mydb',
      'postgresql://user:pass@localhost:5432/mydb',
      'postgres+tcp://user:pass@localhost:5432/mydb',
      'postgresql+tcp://user:pass@localhost:5432/mydb',
      'postgres://user@localhost/mydb', // No password
      'postgres://user:pass@example.com:5432/mydb', // External host
      'postgres://user:pass@localhost:5432/my-db-name', // Hyphenated DB name
      'postgres://user:pass@localhost:5432/db_name', // Underscore in DB name
    ];

    it.each(validUrls)('should accept valid URL: %s', url => {
      const result = databaseUrlValidator.safeParse(url);
      expect(result.success).toBe(true);
    });
  });

  describe('Invalid DATABASE_URLs', () => {
    const invalidUrls = [
      'mysql://user:pass@localhost:3306/mydb', // Wrong protocol
      'http://user:pass@localhost:5432/mydb', // Wrong protocol
      'postgres://user:pass@localhost:5432/', // No database name
      'postgres://user:pass@localhost:5432', // No database name
      // 'postgres://localhost:5432/mydb', // Actually valid - user is optional
      'not-a-url', // Invalid URL format
      // 'postgres://:pass@localhost:5432/mydb', // Actually valid - empty username with password
      'postgres://user:pass@/mydb', // No hostname
      '', // Empty string (should be valid as optional)
    ];

    it.each(invalidUrls.slice(0, -1))('should reject invalid URL: %s', url => {
      const result = databaseUrlValidator.safeParse(url);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          'PostgreSQL connection string'
        );
      }
    });

    it('should accept empty string (build-time allowance)', () => {
      const result = databaseUrlValidator.safeParse('');
      expect(result.success).toBe(true);
    });

    it('should accept undefined (build-time allowance)', () => {
      const result = databaseUrlValidator.safeParse(undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle URLs with query parameters', () => {
      const url = 'postgres://user:pass@localhost:5432/mydb?sslmode=require';
      const result = databaseUrlValidator.safeParse(url);
      expect(result.success).toBe(true);
    });

    it('should handle URLs with special characters in password', () => {
      const url = 'postgres://user:p%40ss@localhost:5432/mydb';
      const result = databaseUrlValidator.safeParse(url);
      expect(result.success).toBe(true);
    });

    it('should handle URLs with non-default ports', () => {
      const url = 'postgres://user:pass@localhost:3333/mydb';
      const result = databaseUrlValidator.safeParse(url);
      expect(result.success).toBe(true);
    });

    it('should handle URLs with IPv4 addresses', () => {
      const url = 'postgres://user:pass@192.168.1.100:5432/mydb';
      const result = databaseUrlValidator.safeParse(url);
      expect(result.success).toBe(true);
    });

    it('should handle URLs with IPv6 addresses', () => {
      const url = 'postgres://user:pass@[::1]:5432/mydb';
      const result = databaseUrlValidator.safeParse(url);
      expect(result.success).toBe(true);
    });
  });

  describe('Protocol Validation', () => {
    it('should accept all valid PostgreSQL protocols', () => {
      const protocols = [
        'postgres:',
        'postgresql:',
        'postgres+tcp:',
        'postgresql+tcp:',
      ];

      protocols.forEach(protocol => {
        const url = `${protocol}//user:pass@localhost:5432/mydb`;
        const result = databaseUrlValidator.safeParse(url);
        expect(result.success).toBe(true);
      });
    });

    it('should reject non-PostgreSQL protocols', () => {
      const invalidProtocols = [
        'mysql:',
        'mongodb:',
        'http:',
        'https:',
        'ftp:',
      ];

      invalidProtocols.forEach(protocol => {
        const url = `${protocol}//user:pass@localhost:5432/mydb`;
        const result = databaseUrlValidator.safeParse(url);
        expect(result.success).toBe(false);
      });
    });
  });
});
