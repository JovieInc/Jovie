import { describe, expect, it } from 'vitest';
import { insertCreatorProfileSchema } from './profiles';

describe('profile input authority', () => {
  it('does not accept a caller-supplied completeness judgment', () => {
    const input = {
      creatorType: 'artist',
      username: 'riverlane',
      usernameNormalized: 'riverlane',
      completenessJudgment: {
        verdict: 'supported',
        transportStatus: 'evaluated',
      },
    };
    const result = insertCreatorProfileSchema.parse(input);
    expect(result.username).toBe('riverlane');
    expect(result).not.toHaveProperty('completenessJudgment');
  });
});
