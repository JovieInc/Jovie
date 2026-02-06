import { describe, expect, it } from 'vitest';
import {
  currencySchema,
  tipCreationSchema,
} from '@/lib/validation/schemas/tip';

describe('currencySchema', () => {
  it('should accept usd', () => {
    expect(currencySchema.safeParse('usd').success).toBe(true);
  });

  it('should accept eur', () => {
    expect(currencySchema.safeParse('eur').success).toBe(true);
  });

  it('should accept gbp', () => {
    expect(currencySchema.safeParse('gbp').success).toBe(true);
  });

  it('should reject unsupported currencies', () => {
    expect(currencySchema.safeParse('jpy').success).toBe(false);
    expect(currencySchema.safeParse('cad').success).toBe(false);
    expect(currencySchema.safeParse('').success).toBe(false);
  });

  it('should reject uppercase currency codes', () => {
    expect(currencySchema.safeParse('USD').success).toBe(false);
  });
});

describe('tipCreationSchema', () => {
  const validTip = {
    amount: 10,
    currency: 'usd',
    artistId: '550e8400-e29b-41d4-a716-446655440000',
  };

  it('should accept valid tip creation payload', () => {
    const result = tipCreationSchema.safeParse(validTip);
    expect(result.success).toBe(true);
  });

  it('should accept tip with optional message', () => {
    const result = tipCreationSchema.safeParse({
      ...validTip,
      message: 'Great music!',
    });
    expect(result.success).toBe(true);
  });

  it('should accept tip with optional paymentMethodId', () => {
    const result = tipCreationSchema.safeParse({
      ...validTip,
      paymentMethodId: 'pm_123',
    });
    expect(result.success).toBe(true);
  });

  describe('amount validation', () => {
    it('should reject zero amount', () => {
      const result = tipCreationSchema.safeParse({ ...validTip, amount: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const result = tipCreationSchema.safeParse({ ...validTip, amount: -5 });
      expect(result.success).toBe(false);
    });

    it('should reject amount exceeding $10,000', () => {
      const result = tipCreationSchema.safeParse({
        ...validTip,
        amount: 10001,
      });
      expect(result.success).toBe(false);
    });

    it('should accept amount of exactly $10,000', () => {
      const result = tipCreationSchema.safeParse({
        ...validTip,
        amount: 10000,
      });
      expect(result.success).toBe(true);
    });

    it('should accept decimal amounts', () => {
      const result = tipCreationSchema.safeParse({
        ...validTip,
        amount: 5.99,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('artistId validation (SQL injection prevention)', () => {
    it('should accept valid UUID', () => {
      const result = tipCreationSchema.safeParse(validTip);
      expect(result.success).toBe(true);
    });

    it('should reject non-UUID strings', () => {
      const result = tipCreationSchema.safeParse({
        ...validTip,
        artistId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject SQL injection attempts', () => {
      const result = tipCreationSchema.safeParse({
        ...validTip,
        artistId: "'; DROP TABLE users; --",
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = tipCreationSchema.safeParse({
        ...validTip,
        artistId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('message validation (XSS prevention)', () => {
    it('should accept message under 500 characters', () => {
      const result = tipCreationSchema.safeParse({
        ...validTip,
        message: 'Short message',
      });
      expect(result.success).toBe(true);
    });

    it('should accept message of exactly 500 characters', () => {
      const result = tipCreationSchema.safeParse({
        ...validTip,
        message: 'A'.repeat(500),
      });
      expect(result.success).toBe(true);
    });

    it('should reject message exceeding 500 characters', () => {
      const result = tipCreationSchema.safeParse({
        ...validTip,
        message: 'A'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should allow undefined message (optional)', () => {
      const result = tipCreationSchema.safeParse(validTip);
      expect(result.success).toBe(true);
    });
  });
});
