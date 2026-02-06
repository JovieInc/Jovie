import { describe, expect, it } from 'vitest';
import { accountEmailSyncSchema } from '@/lib/validation/schemas/account';

describe('accountEmailSyncSchema', () => {
  it('should accept valid email', () => {
    const result = accountEmailSyncSchema.safeParse({
      email: 'user@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('should accept email with subdomain', () => {
    const result = accountEmailSyncSchema.safeParse({
      email: 'user@mail.example.com',
    });
    expect(result.success).toBe(true);
  });

  it('should accept email with plus addressing', () => {
    const result = accountEmailSyncSchema.safeParse({
      email: 'user+tag@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email format', () => {
    const invalidEmails = [
      'not-an-email',
      '@example.com',
      'user@',
      '',
      'user @example.com',
    ];

    invalidEmails.forEach(email => {
      const result = accountEmailSyncSchema.safeParse({ email });
      expect(result.success).toBe(false);
    });
  });

  it('should reject missing email field', () => {
    const result = accountEmailSyncSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject non-string email', () => {
    const result = accountEmailSyncSchema.safeParse({ email: 123 });
    expect(result.success).toBe(false);
  });
});
