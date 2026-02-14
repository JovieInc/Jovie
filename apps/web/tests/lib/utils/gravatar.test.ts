import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getGravatarUrl } from '@/lib/utils/gravatar';

describe('getGravatarUrl', () => {
  it('should generate a valid Gravatar URL from an email', () => {
    const url = getGravatarUrl('user@example.com');
    expect(url).toMatch(
      /^https:\/\/www\.gravatar\.com\/avatar\/[a-f0-9]{32}\?s=512&d=404$/
    );
  });

  it('should produce correct MD5 hash matching Node.js crypto', () => {
    const email = 'test@example.com';
    const expectedHash = createHash('md5')
      .update(email.toLowerCase().trim())
      .digest('hex');
    const url = getGravatarUrl(email);
    expect(url).toBe(
      `https://www.gravatar.com/avatar/${expectedHash}?s=512&d=404`
    );
  });

  it('should normalize email to lowercase before hashing', () => {
    const lower = getGravatarUrl('user@example.com');
    const upper = getGravatarUrl('USER@EXAMPLE.COM');
    const mixed = getGravatarUrl('User@Example.Com');
    expect(lower).toBe(upper);
    expect(lower).toBe(mixed);
  });

  it('should trim whitespace from email before hashing', () => {
    const trimmed = getGravatarUrl('user@example.com');
    const padded = getGravatarUrl('  user@example.com  ');
    expect(trimmed).toBe(padded);
  });

  it('should use custom size when provided', () => {
    const url = getGravatarUrl('user@example.com', 200);
    expect(url).toContain('s=200');
  });

  it('should default to size 512', () => {
    const url = getGravatarUrl('user@example.com');
    expect(url).toContain('s=512');
  });

  it('should use d=404 fallback', () => {
    const url = getGravatarUrl('user@example.com');
    expect(url).toContain('d=404');
  });

  it('should produce different hashes for different emails', () => {
    const url1 = getGravatarUrl('alice@example.com');
    const url2 = getGravatarUrl('bob@example.com');
    expect(url1).not.toBe(url2);
  });

  it('should handle emails with special characters', () => {
    const url = getGravatarUrl('user+tag@example.com');
    const expectedHash = createHash('md5')
      .update('user+tag@example.com')
      .digest('hex');
    expect(url).toBe(
      `https://www.gravatar.com/avatar/${expectedHash}?s=512&d=404`
    );
  });

  it('should handle empty string', () => {
    const url = getGravatarUrl('');
    const expectedHash = createHash('md5').update('').digest('hex');
    expect(url).toBe(
      `https://www.gravatar.com/avatar/${expectedHash}?s=512&d=404`
    );
  });
});
