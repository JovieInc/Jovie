import { describe, expect, it } from 'vitest';
import { calculateRequiredProfileCompletion } from '@/lib/profile/completion';

describe('calculateRequiredProfileCompletion', () => {
  it('returns 100% when name, avatar, handle, and music links are present', () => {
    const result = calculateRequiredProfileCompletion({
      displayName: 'Artist Name',
      avatarUrl: 'https://cdn.example.com/avatar.jpg',
      handle: 'artistname',
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
      handle: ' ',
      hasMusicLinks: true,
    });

    expect(result.percentage).toBe(50);
    expect(result.completedCount).toBe(2);
    expect(result.isComplete).toBe(false);
  });

  it('does not count email — only photo, name, handle, and one music DSP (JOV-8137)', () => {
    const result = calculateRequiredProfileCompletion({
      displayName: 'Artist Name',
      avatarUrl: 'https://cdn.example.com/avatar.jpg',
      handle: 'artistname',
      hasMusicLinks: false,
    });

    expect(result.percentage).toBe(75);
    expect(result.isComplete).toBe(false);
  });

  it('treats a missing handle as incomplete even with name, photo, and music', () => {
    const result = calculateRequiredProfileCompletion({
      displayName: 'Artist Name',
      avatarUrl: 'https://cdn.example.com/avatar.jpg',
      handle: null,
      hasMusicLinks: true,
    });

    expect(result.hasHandle).toBe(false);
    expect(result.isComplete).toBe(false);
  });
});
