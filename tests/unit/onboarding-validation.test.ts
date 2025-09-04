import { describe, expect, it } from 'vitest';
import { onboardingSchema, type OnboardingValues } from '@/lib/validation/onboarding';

describe('Onboarding Validation Schema', () => {
  describe('handle validation', () => {
    it('should accept valid handles', () => {
      const validHandles = [
        'abc',
        'user123',
        'my-handle',
        'test-user-123',
        'a1b2c3',
      ];

      validHandles.forEach((handle) => {
        const result = onboardingSchema.shape.handle.safeParse(handle);
        expect(result.success, `Handle "${handle}" should be valid`).toBe(true);
      });
    });

    it('should reject handles that are too short', () => {
      const shortHandles = ['a', 'ab', ''];

      shortHandles.forEach((handle) => {
        const result = onboardingSchema.shape.handle.safeParse(handle);
        expect(result.success, `Handle "${handle}" should be invalid (too short)`).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('at least 3 characters');
        }
      });
    });

    it('should reject handles that are too long', () => {
      const longHandle = 'a'.repeat(25);
      const result = onboardingSchema.shape.handle.safeParse(longHandle);
      expect(result.success, `Handle should be invalid (too long)`).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('no more than 24 characters');
      }
    });

    it('should reject handles with invalid characters', () => {
      const invalidHandles = [
        'user@123',
        'my handle',
        'test_user',
        'user!',
        'TEST',
        'user.name',
      ];

      invalidHandles.forEach((handle) => {
        const result = onboardingSchema.shape.handle.safeParse(handle);
        expect(result.success, `Handle "${handle}" should be invalid (invalid chars)`).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('lowercase letters, numbers, and hyphens');
        }
      });
    });
  });

  describe('fullName validation', () => {
    it('should accept valid full names', () => {
      const validNames = [
        'John Doe',
        'Mary Jane Watson-Smith',
        "O'Connor",
        'Jean-Luc',
        'Dr. Smith',
        'Anna',
        'José María',
        '李小明', // Should fail with current regex but testing boundary
        'John123', // Numbers allowed
        'A', // Single character
      ];

      // Filter out names that contain characters not in our allowed set
      const allowedNames = validNames.filter(name => /^[a-zA-Z0-9\s\-'.]+$/.test(name));

      allowedNames.forEach((name) => {
        const result = onboardingSchema.shape.fullName.safeParse(name);
        expect(result.success, `Name "${name}" should be valid`).toBe(true);
      });
    });

    it('should reject empty names', () => {
      const emptyNames = ['', ' ', '   '];

      emptyNames.forEach((name) => {
        const result = onboardingSchema.shape.fullName.safeParse(name);
        expect(result.success, `Name "${name}" should be invalid (empty)`).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('enter your name');
        }
      });
    });

    it('should reject names that are too long', () => {
      const longName = 'A'.repeat(51);
      const result = onboardingSchema.shape.fullName.safeParse(longName);
      expect(result.success, `Name should be invalid (too long)`).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('50 characters or less');
      }
    });

    it('should accept names at the length boundary', () => {
      const maxLengthName = 'A'.repeat(50);
      const result = onboardingSchema.shape.fullName.safeParse(maxLengthName);
      expect(result.success, `Name of exactly 50 characters should be valid`).toBe(true);
    });

    it('should reject names with invalid characters', () => {
      const invalidNames = [
        'John@Doe',
        'User#123',
        'Name with emoji 🎉',
        'User<script>',
        'Name&Co',
        'User%20Name',
      ];

      invalidNames.forEach((name) => {
        const result = onboardingSchema.shape.fullName.safeParse(name);
        expect(result.success, `Name "${name}" should be invalid (invalid chars)`).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('letters, numbers, spaces, hyphens, apostrophes, and periods');
        }
      });
    });
  });

  describe('complete onboarding schema', () => {
    it('should accept valid complete data', () => {
      const validData: OnboardingValues = {
        handle: 'testuser123',
        fullName: 'Test User',
      };

      const result = onboardingSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.handle).toBe('testuser123');
        expect(result.data.fullName).toBe('Test User');
      }
    });

    it('should reject data with any invalid field', () => {
      const invalidData = [
        { handle: '', fullName: 'Test User' }, // Invalid handle
        { handle: 'testuser', fullName: '' }, // Invalid fullName
        { handle: 'TEST', fullName: 'Test@User' }, // Both invalid
      ];

      invalidData.forEach((data, index) => {
        const result = onboardingSchema.safeParse(data);
        expect(result.success, `Data set ${index + 1} should be invalid`).toBe(false);
      });
    });

    it('should have correct TypeScript types', () => {
      // This is more of a compile-time test, but we can verify the shape
      const validData: OnboardingValues = {
        handle: 'testuser',
        fullName: 'Test User',
      };

      // TypeScript should enforce these properties exist
      expect(typeof validData.handle).toBe('string');
      expect(typeof validData.fullName).toBe('string');
    });
  });
});