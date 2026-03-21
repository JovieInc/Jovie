import { describe, expect, it } from 'vitest';
import { profileUpdateSchema } from '@/lib/validation/schemas/dashboard/profile';

describe('pitchContext validation', () => {
  const validBase = {
    displayName: 'Test Artist',
    username: 'testartist',
  };

  it('accepts pitchContext up to 2000 characters', () => {
    const result = profileUpdateSchema.safeParse({
      ...validBase,
      pitchContext: 'a'.repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it('rejects pitchContext over 2000 characters', () => {
    const result = profileUpdateSchema.safeParse({
      ...validBase,
      pitchContext: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts undefined pitchContext', () => {
    const result = profileUpdateSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('trims whitespace from pitchContext', () => {
    const result = profileUpdateSchema.safeParse({
      ...validBase,
      pitchContext: '  some context  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pitchContext).toBe('some context');
    }
  });

  it('accepts empty string pitchContext', () => {
    const result = profileUpdateSchema.safeParse({
      ...validBase,
      pitchContext: '',
    });
    expect(result.success).toBe(true);
  });
});
