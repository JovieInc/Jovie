import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from '@/lib/utils';
import {
  generateUsernameSuggestions,
  validateUsernameFormat,
} from '@/lib/validation/client-username';

describe('validateUsernameFormat', () => {
  it('should return valid for proper usernames', () => {
    expect(validateUsernameFormat('john-doe')).toEqual({
      valid: true,
      error: null,
    });

    expect(validateUsernameFormat('artist123')).toEqual({
      valid: true,
      error: null,
    });

    expect(validateUsernameFormat('valid-username-123')).toEqual({
      valid: true,
      error: null,
    });
  });

  it('should reject usernames that are too short', () => {
    expect(validateUsernameFormat('ab')).toEqual({
      valid: false,
      error: 'Handle must be at least 3 characters',
    });
  });

  it('should reject usernames that are too long', () => {
    const longUsername = 'a'.repeat(31);
    expect(validateUsernameFormat(longUsername)).toEqual({
      valid: false,
      error: 'Handle must be no more than 30 characters',
    });
  });

  it('should reject usernames with invalid characters', () => {
    expect(validateUsernameFormat('user_name')).toEqual({
      valid: false,
      error: 'Handle can only contain letters, numbers, and hyphens',
    });

    expect(validateUsernameFormat('user@name')).toEqual({
      valid: false,
      error: 'Handle can only contain letters, numbers, and hyphens',
    });

    expect(validateUsernameFormat('user name')).toEqual({
      valid: false,
      error: 'Handle can only contain letters, numbers, and hyphens',
    });
  });

  it('should reject usernames starting with hyphens', () => {
    expect(validateUsernameFormat('-username')).toEqual({
      valid: false,
      error: 'Handle must start with a letter',
    });
  });

  it('should reject usernames ending with hyphens', () => {
    expect(validateUsernameFormat('username-')).toEqual({
      valid: false,
      error: 'Handle cannot end with a hyphen',
    });
  });

  it('should reject usernames with consecutive hyphens', () => {
    expect(validateUsernameFormat('user--name')).toEqual({
      valid: false,
      error: 'Handle cannot contain consecutive hyphens',
    });
  });

  it('should reject reserved usernames', () => {
    expect(validateUsernameFormat('admin')).toEqual({
      valid: false,
      error: 'This handle is reserved and cannot be used',
      suggestion: 'admin-artist',
    });

    expect(validateUsernameFormat('api')).toEqual({
      valid: false,
      error: 'This handle is reserved and cannot be used',
      suggestion: 'api-artist',
    });
  });

  it('should handle empty usernames', () => {
    expect(validateUsernameFormat('')).toEqual({
      valid: false,
      error: null,
    });
  });
});

describe('generateUsernameSuggestions', () => {
  it('should generate suggestions based on artist name', () => {
    const suggestions = generateUsernameSuggestions('test', 'The Beatles');
    expect(suggestions).toContain('the-beatles');
    expect(suggestions).toContain('the-beatles-music');
    expect(suggestions).toContain('the-beatles-official');
  });

  it('should generate suggestions for base username', () => {
    const suggestions = generateUsernameSuggestions('artist');
    expect(suggestions).toContain('artist1');
    expect(suggestions).toContain('artist2');
    expect(suggestions).toContain('artist3');
  });

  it('should include numbered variations', () => {
    const suggestions = generateUsernameSuggestions('user');
    expect(suggestions).toContain('user1');
    expect(suggestions).toContain('user2');
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });

  it('should filter out invalid suggestions', () => {
    const suggestions = generateUsernameSuggestions('a'); // Too short base
    suggestions.forEach(suggestion => {
      expect(validateUsernameFormat(suggestion).valid).toBe(true);
    });
  });

  it('should limit suggestions to 5', () => {
    const suggestions = generateUsernameSuggestions('test', 'Artist Name');
    expect(suggestions.length).toBeLessThanOrEqual(5);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn('arg1');
    expect(mockFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledWith('arg1');
  });

  it('should cancel previous calls', () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn('arg1');
    debouncedFn('arg2');

    vi.advanceTimersByTime(100);

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('arg2');
  });
});
