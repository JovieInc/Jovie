import { describe, expect, it } from 'vitest';
import { onboardingSchema } from '@/lib/validation/onboarding';

describe('onboarding validation', () => {
  describe('handle validation', () => {
    it('should accept valid handle', () => {
      const result = onboardingSchema.parse({
        handle: 'test123',
        fullName: 'Test User',
      });
      expect(result.handle).toBe('test123');
    });

    it('should reject handle that is too short', () => {
      expect(() => {
        onboardingSchema.parse({
          handle: 'ab',
          fullName: 'Test User',
        });
      }).toThrow('Must be at least 3 characters');
    });

    it('should reject handle that is too long', () => {
      const longHandle = 'a'.repeat(25);
      expect(() => {
        onboardingSchema.parse({
          handle: longHandle,
          fullName: 'Test User',
        });
      }).toThrow('Must be no more than 24 characters');
    });

    it('should reject handle with invalid characters', () => {
      expect(() => {
        onboardingSchema.parse({
          handle: 'test@user',
          fullName: 'Test User',
        });
      }).toThrow('Only lowercase letters, numbers, and hyphens are allowed');
    });

    it('should reject handle with uppercase letters', () => {
      expect(() => {
        onboardingSchema.parse({
          handle: 'TestUser',
          fullName: 'Test User',
        });
      }).toThrow('Only lowercase letters, numbers, and hyphens are allowed');
    });
  });

  describe('full name validation', () => {
    it('should accept valid full name', () => {
      const result = onboardingSchema.parse({
        handle: 'testuser',
        fullName: 'John Doe',
      });
      expect(result.fullName).toBe('John Doe');
    });

    it('should accept full name with special characters', () => {
      const result = onboardingSchema.parse({
        handle: 'testuser',
        fullName: "John O'Connor-Smith Jr.",
      });
      expect(result.fullName).toBe("John O'Connor-Smith Jr.");
    });

    it('should accept full name with numbers', () => {
      const result = onboardingSchema.parse({
        handle: 'testuser',
        fullName: 'John Doe 3rd',
      });
      expect(result.fullName).toBe('John Doe 3rd');
    });

    it('should reject empty full name', () => {
      expect(() => {
        onboardingSchema.parse({
          handle: 'testuser',
          fullName: '',
        });
      }).toThrow('Full name is required');
    });

    it('should reject full name that is too long', () => {
      const longName = 'A'.repeat(51);
      expect(() => {
        onboardingSchema.parse({
          handle: 'testuser',
          fullName: longName,
        });
      }).toThrow('Full name must be no more than 50 characters');
    });

    it('should reject full name with invalid characters', () => {
      expect(() => {
        onboardingSchema.parse({
          handle: 'testuser',
          fullName: 'John@Doe#',
        });
      }).toThrow('Only letters, numbers, spaces, hyphens, apostrophes, and periods are allowed');
    });

    it('should accept minimal valid input', () => {
      const result = onboardingSchema.parse({
        handle: 'abc',
        fullName: 'A',
      });
      expect(result.handle).toBe('abc');
      expect(result.fullName).toBe('A');
    });
  });
});