import { describe, expect, it } from 'vitest';
import { ProfileUpdateSchema } from './validation';

describe('dashboard profile username updates', () => {
  it('rejects renaming a profile to the token-only claim fixture', () => {
    const result = ProfileUpdateSchema.safeParse({
      username: 'e2eclaimartist',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'This handle is reserved and cannot be used'
      );
    }
  });

  it('keeps legitimate profile renames available', () => {
    expect(
      ProfileUpdateSchema.safeParse({ username: 'realartist' }).success
    ).toBe(true);
  });
});
