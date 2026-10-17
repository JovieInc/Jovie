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

describe('owner searchability choice validation', () => {
  it.each([true, false])(
    'accepts the explicit boolean choice %s',
    searchable => {
      expect(
        ProfileUpdateSchema.parse({ settings: { searchable } }).settings
      ).toEqual({ searchable });
    }
  );

  it('does not insert a discovery choice when saving unrelated profile settings', () => {
    const parsed = ProfileUpdateSchema.parse({
      settings: { marketing_emails: false },
    });
    expect(parsed.settings).toEqual({ marketing_emails: false });
    expect(Object.hasOwn(parsed.settings ?? {}, 'searchable')).toBe(false);
  });

  it.each([null, 'false', 1, [], {}])(
    'rejects a malformed searchability choice %s',
    searchable => {
      expect(
        ProfileUpdateSchema.safeParse({ settings: { searchable } }).success
      ).toBe(false);
    }
  );
});
