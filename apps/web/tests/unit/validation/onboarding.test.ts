import { describe, expect, it } from 'vitest';
import { onboardingSchema } from '@/lib/validation/schemas';

describe('onboardingSchema', () => {
  describe('handle validation', () => {
    it('should accept valid handles', () => {
      const validHandles = ['abc123', 'test-user', '123456', 'a-b-c'];

      validHandles.forEach(handle => {
        const result = onboardingSchema.safeParse({
          handle,
          fullName: 'Test User',
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject handles that are too short', () => {
      const result = onboardingSchema.safeParse({
        handle: 'ab',
        fullName: 'Test User',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Must be at least 3 characters'
        );
      }
    });

    it('should reject handles that are too long', () => {
      const longHandle = 'a'.repeat(25);
      const result = onboardingSchema.safeParse({
        handle: longHandle,
        fullName: 'Test User',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Must be no more than 24 characters'
        );
      }
    });

    it('should reject handles with invalid characters', () => {
      const invalidHandles = [
        'test@user',
        'test user',
        'test.user',
        'test_user',
        'Test',
      ];

      invalidHandles.forEach(handle => {
        const result = onboardingSchema.safeParse({
          handle,
          fullName: 'Test User',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'Only lowercase letters, numbers, and hyphens are allowed'
          );
        }
      });
    });
  });

  describe('fullName validation', () => {
    it('should accept valid full names', () => {
      const validNames = [
        'John Doe',
        'Mary Jane Watson',
        'Jean-Pierre',
        "O'Connor",
        'John Smith Jr.',
        'João Silva',
        'Anna-Maria',
        'Test123',
      ];

      validNames.forEach(fullName => {
        const result = onboardingSchema.safeParse({ handle: 'test', fullName });
        expect(result.success).toBe(true);
      });
    });

    it('should reject empty full names', () => {
      const result = onboardingSchema.safeParse({
        handle: 'test',
        fullName: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Full name is required');
      }
    });

    it('should reject full names that are too long', () => {
      const longName = 'A'.repeat(51);
      const result = onboardingSchema.safeParse({
        handle: 'test',
        fullName: longName,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(
          'Must be no more than 50 characters'
        );
      }
    });

    it('should reject full names with invalid characters', () => {
      const invalidNames = [
        'John@Doe',
        'Test#User',
        'User&Name',
        'Name*Test',
        'Test(Name)',
        'User[Name]',
      ];

      invalidNames.forEach(fullName => {
        const result = onboardingSchema.safeParse({ handle: 'test', fullName });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toBe(
            'Only letters, numbers, spaces, hyphens, apostrophes, and periods are allowed'
          );
        }
      });
    });

    it('should accept full names with exactly 50 characters', () => {
      const fiftyCharName = 'A'.repeat(50);
      const result = onboardingSchema.safeParse({
        handle: 'test',
        fullName: fiftyCharName,
      });
      expect(result.success).toBe(true);
    });

    it('should accept full names with exactly 1 character', () => {
      const result = onboardingSchema.safeParse({
        handle: 'test',
        fullName: 'A',
      });
      expect(result.success).toBe(true);
    });
  });

  it('should validate both fields together', () => {
    const result = onboardingSchema.safeParse({
      handle: 'john-doe',
      fullName: 'John Doe',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        handle: 'john-doe',
        fullName: 'John Doe',
      });
    }
  });
});
