import { describe, expect, it } from 'vitest';
import { parseProfileUpdates, ProfileUpdateSchema } from './validation';

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

  it('saves other fields when the owned handle is a reserved fixture', () => {
    const result = parseProfileUpdates(
      {
        username: 'browse-ready-user',
        careerHighlights: 'Golden path test',
      },
      { currentUsername: 'browse-ready-user' }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed.username).toBe('browse-ready-user');
    expect(result.parsed.careerHighlights).toBe('Golden path test');
  });

  it('still rejects claiming a reserved fixture from a different handle', () => {
    const result = parseProfileUpdates(
      { username: 'browse-ready-user', careerHighlights: 'Golden path test' },
      { currentUsername: 'real-artist' }
    );

    expect(result.ok).toBe(false);
  });
});
