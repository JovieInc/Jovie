import { describe, expect, it } from 'vitest';
import { profileUpdateSchema } from '@/lib/validation/schemas/dashboard/profile';

describe('careerHighlights validation', () => {
  const validBase = {
    displayName: 'Test Artist',
    username: 'testartist',
  };

  it('accepts careerHighlights up to 2000 characters', () => {
    const result = profileUpdateSchema.safeParse({
      ...validBase,
      careerHighlights: 'a'.repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it('rejects careerHighlights over 2000 characters', () => {
    const result = profileUpdateSchema.safeParse({
      ...validBase,
      careerHighlights: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts undefined careerHighlights', () => {
    const result = profileUpdateSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('trims whitespace from careerHighlights', () => {
    const result = profileUpdateSchema.safeParse({
      ...validBase,
      careerHighlights: '  some context  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.careerHighlights).toBe('some context');
    }
  });

  it('accepts empty string careerHighlights', () => {
    const result = profileUpdateSchema.safeParse({
      ...validBase,
      careerHighlights: '',
    });
    expect(result.success).toBe(true);
  });
});
