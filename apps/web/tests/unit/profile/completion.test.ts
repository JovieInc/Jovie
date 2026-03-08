import { describe, expect, it } from 'vitest';
import { calculateRequiredProfileCompletion } from '@/lib/profile/completion';

describe('calculateRequiredProfileCompletion', () => {
  it('returns 100% when name, avatar, email, and music links are present', () => {
    const result = calculateRequiredProfileCompletion({
      displayName: 'Artist Name',
      avatarUrl: 'https://cdn.example.com/avatar.jpg',
      email: 'artist@example.com',
      hasMusicLinks: true,
    });

    expect(result.percentage).toBe(100);
    expect(result.completedCount).toBe(4);
    expect(result.totalCount).toBe(4);
    expect(result.isComplete).toBe(true);
  });

  it('does not count optional fields and trims whitespace-only values', () => {
    const result = calculateRequiredProfileCompletion({
      displayName: '   ',
      avatarUrl: 'https://cdn.example.com/avatar.jpg',
      email: ' ',
      hasMusicLinks: true,
    });

    expect(result.percentage).toBe(50);
    expect(result.completedCount).toBe(2);
    expect(result.isComplete).toBe(false);
  });
});
