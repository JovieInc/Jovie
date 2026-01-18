/**
 * PII Encryption Tests
 * Validates AES-256-GCM encryption for personally identifiable information
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  decryptEmail,
  decryptIP,
  decryptPhone,
  decryptPII,
  decryptPIIFields,
  encryptEmail,
  encryptIP,
  encryptPhone,
  encryptPII,
  encryptPIIFields,
  hashPIIForLookup,
  isPIIEncryptionEnabled,
  maskIPForFingerprint,
} from '@/lib/utils/pii-encryption';

// Set up encryption key once for all tests (except isPIIEncryptionEnabled tests)
const TEST_ENCRYPTION_KEY = 'test-key-for-encryption-32-chars!';
let originalEnvKey: string | undefined;

beforeAll(() => {
  originalEnvKey = process.env.PII_ENCRYPTION_KEY;
  process.env.PII_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
});

afterAll(() => {
  if (originalEnvKey) {
    process.env.PII_ENCRYPTION_KEY = originalEnvKey;
  } else {
    delete process.env.PII_ENCRYPTION_KEY;
  }
});

describe('PII Encryption', () => {
  describe('isPIIEncryptionEnabled', () => {
    it('should return false when PII_ENCRYPTION_KEY is not set', () => {
      const originalEnv = process.env.PII_ENCRYPTION_KEY;
      delete process.env.PII_ENCRYPTION_KEY;

      expect(isPIIEncryptionEnabled()).toBe(false);

      if (originalEnv) {
        process.env.PII_ENCRYPTION_KEY = originalEnv;
      }
    });

    it('should return true when PII_ENCRYPTION_KEY is set', () => {
      const originalEnv = process.env.PII_ENCRYPTION_KEY;
      process.env.PII_ENCRYPTION_KEY = 'test-key-for-encryption-32-chars!';

      expect(isPIIEncryptionEnabled()).toBe(true);

      if (originalEnv) {
        process.env.PII_ENCRYPTION_KEY = originalEnv;
      } else {
        delete process.env.PII_ENCRYPTION_KEY;
      }
    });
  });

  describe('encryptPII and decryptPII', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const originalValue = 'test@example.com';

      const encrypted = encryptPII(originalValue);
      expect(encrypted).not.toBe(originalValue);
      expect(encrypted).not.toBeNull();
      expect(encrypted!.split(':').length).toBe(3); // iv:authTag:ciphertext

      const decrypted = decryptPII(encrypted);
      expect(decrypted).toBe(originalValue);
    });

    it('should return null for null input', () => {
      expect(encryptPII(null)).toBeNull();
      expect(encryptPII(undefined)).toBeNull();
      expect(encryptPII('')).toBeNull();
    });

    it('should return null for null decryption input', () => {
      expect(decryptPII(null)).toBeNull();
      expect(decryptPII(undefined)).toBeNull();
      expect(decryptPII('')).toBeNull();
    });

    it('should handle legacy unencrypted data gracefully', () => {
      // Legacy data without encryption format (no colons)
      const legacyValue = 'legacy@example.com';
      const decrypted = decryptPII(legacyValue);
      expect(decrypted).toBe(legacyValue);
    });

    it('should generate different ciphertext for same input (random IV)', () => {
      const value = 'consistent@example.com';

      const encrypted1 = encryptPII(value);
      const encrypted2 = encryptPII(value);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      expect(decryptPII(encrypted1)).toBe(value);
      expect(decryptPII(encrypted2)).toBe(value);
    });
  });

  describe('Email encryption helpers', () => {
    it('should encrypt and decrypt email addresses', () => {
      const email = 'user@example.com';

      const encrypted = encryptEmail(email);
      expect(encrypted).not.toBe(email);

      const decrypted = decryptEmail(encrypted);
      expect(decrypted).toBe(email);
    });
  });

  describe('Phone encryption helpers', () => {
    it('should encrypt and decrypt phone numbers', () => {
      const phone = '+1-555-123-4567';

      const encrypted = encryptPhone(phone);
      expect(encrypted).not.toBe(phone);

      const decrypted = decryptPhone(encrypted);
      expect(decrypted).toBe(phone);
    });
  });

  describe('IP encryption helpers', () => {
    it('should encrypt and decrypt IPv4 addresses', () => {
      const ip = '192.168.1.100';

      const encrypted = encryptIP(ip);
      expect(encrypted).not.toBe(ip);

      const decrypted = decryptIP(encrypted);
      expect(decrypted).toBe(ip);
    });

    it('should encrypt and decrypt IPv6 addresses', () => {
      const ip = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';

      const encrypted = encryptIP(ip);
      expect(encrypted).not.toBe(ip);

      const decrypted = decryptIP(encrypted);
      expect(decrypted).toBe(ip);
    });
  });

  describe('maskIPForFingerprint', () => {
    it('should mask IPv4 addresses correctly', () => {
      expect(maskIPForFingerprint('192.168.1.100')).toBe('192.168.1.0');
      expect(maskIPForFingerprint('10.0.0.255')).toBe('10.0.0.0');
      expect(maskIPForFingerprint('172.16.0.1')).toBe('172.16.0.0');
    });

    it('should mask IPv6 addresses correctly', () => {
      const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
      const masked = maskIPForFingerprint(ipv6);
      expect(masked).toBe('2001:0db8:85a3:0000::');
    });

    it('should return unknown for null or undefined', () => {
      expect(maskIPForFingerprint(null)).toBe('unknown');
      expect(maskIPForFingerprint(undefined)).toBe('unknown');
      expect(maskIPForFingerprint('')).toBe('unknown');
    });
  });

  describe('hashPIIForLookup', () => {
    it('should generate consistent hashes for same value', () => {
      const value = 'test@example.com';

      const hash1 = hashPIIForLookup(value);
      const hash2 = hashPIIForLookup(value);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different values', () => {
      const hash1 = hashPIIForLookup('test1@example.com');
      const hash2 = hashPIIForLookup('test2@example.com');

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize case for consistent hashing', () => {
      const hash1 = hashPIIForLookup('Test@Example.COM');
      const hash2 = hashPIIForLookup('test@example.com');

      expect(hash1).toBe(hash2);
    });

    it('should return null for null input', () => {
      expect(hashPIIForLookup(null)).toBeNull();
      expect(hashPIIForLookup(undefined)).toBeNull();
    });

    it('should return a valid SHA-256 hash format', () => {
      const hash = hashPIIForLookup('test@example.com');

      expect(hash).not.toBeNull();
      expect(hash!.length).toBe(64); // SHA-256 produces 64 hex characters
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('Batch encryption helpers', () => {
    it('should encrypt multiple fields at once', () => {
      const data = {
        email: 'user@example.com',
        phone: '+1-555-123-4567',
        ipAddress: '192.168.1.100',
        name: 'John Doe', // Should remain unchanged
      };

      const encrypted = encryptPIIFields(data, ['email', 'phone', 'ipAddress']);

      expect(encrypted.email).not.toBe(data.email);
      expect(encrypted.phone).not.toBe(data.phone);
      expect(encrypted.ipAddress).not.toBe(data.ipAddress);
      expect(encrypted.name).toBe(data.name);
    });

    it('should decrypt multiple fields at once', () => {
      const original = {
        email: 'user@example.com',
        phone: '+1-555-123-4567',
        name: 'John Doe',
      };

      const encrypted = encryptPIIFields(original, ['email', 'phone']);
      const decrypted = decryptPIIFields(encrypted, ['email', 'phone']);

      expect(decrypted.email).toBe(original.email);
      expect(decrypted.phone).toBe(original.phone);
      expect(decrypted.name).toBe(original.name);
    });
  });
});
