import { describe, expect, it } from 'vitest';
import { tipIntentSchema } from '@/lib/validation/schemas/payments';

describe('tipIntentSchema', () => {
  it('should accept valid tip intent', () => {
    const result = tipIntentSchema.safeParse({ amount: 5, handle: 'artist1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ amount: 5, handle: 'artist1' });
    }
  });

  it('should accept minimum amount of 1', () => {
    const result = tipIntentSchema.safeParse({ amount: 1, handle: 'test' });
    expect(result.success).toBe(true);
  });

  it('should accept maximum amount of 500', () => {
    const result = tipIntentSchema.safeParse({ amount: 500, handle: 'test' });
    expect(result.success).toBe(true);
  });

  it('should reject amount below 1', () => {
    const result = tipIntentSchema.safeParse({ amount: 0, handle: 'test' });
    expect(result.success).toBe(false);
  });

  it('should reject amount above 500', () => {
    const result = tipIntentSchema.safeParse({ amount: 501, handle: 'test' });
    expect(result.success).toBe(false);
  });

  it('should reject non-integer amounts', () => {
    const result = tipIntentSchema.safeParse({ amount: 5.5, handle: 'test' });
    expect(result.success).toBe(false);
  });

  it('should reject negative amounts', () => {
    const result = tipIntentSchema.safeParse({ amount: -10, handle: 'test' });
    expect(result.success).toBe(false);
  });

  it('should reject missing handle', () => {
    const result = tipIntentSchema.safeParse({ amount: 5 });
    expect(result.success).toBe(false);
  });

  it('should reject missing amount', () => {
    const result = tipIntentSchema.safeParse({ handle: 'test' });
    expect(result.success).toBe(false);
  });

  it('should reject empty object', () => {
    const result = tipIntentSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
