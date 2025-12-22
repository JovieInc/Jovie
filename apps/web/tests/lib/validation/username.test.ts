import { describe, expect, it } from 'vitest';
import { validateUsername } from '@/lib/validation/username';

describe('validateUsername (server)', () => {
  it('accepts usernames with hyphens', () => {
    const result = validateUsername('john-doe');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects usernames with invalid characters', () => {
    const result = validateUsername('john_doe');
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects usernames that are too short', () => {
    const result = validateUsername('ab');
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects usernames that are too long', () => {
    const longUsername = 'a'.repeat(31);
    const result = validateUsername(longUsername);
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });
});
