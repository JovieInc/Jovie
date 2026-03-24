import { describe, expect, it } from 'vitest';
import type { BlogPostMetadata } from '@/lib/blog/getBlogPosts';
import { resolveAuthor } from '@/lib/blog/resolveAuthor';
import type { ProfileData } from '@/lib/services/profile';

const basePost: BlogPostMetadata = {
  title: 'Test Post',
  date: '2026-01-01',
  author: 'Fallback Author',
  authorUsername: 'tim',
  authorTitle: 'Founder at Jovie',
  authorProfile: 'https://jov.ie/tim',
  excerpt: 'Test excerpt',
  tags: [],
  readingTime: 3,
  wordCount: 714,
};

const baseProfile = {
  displayName: 'Tim White',
  username: 'tim',
  usernameNormalized: 'tim',
  avatarUrl: 'https://cdn.jov.ie/avatars/tim.jpg',
  isVerified: true,
} as ProfileData;

describe('resolveAuthor', () => {
  describe('name resolution', () => {
    it('uses profile displayName when available', () => {
      const author = resolveAuthor(basePost, baseProfile);
      expect(author.name).toBe('Tim White');
    });

    it('falls back to frontmatter author when profile is null', () => {
      const author = resolveAuthor(basePost, null);
      expect(author.name).toBe('Fallback Author');
    });

    it('falls back to frontmatter author when profile is undefined', () => {
      const author = resolveAuthor(basePost, undefined);
      expect(author.name).toBe('Fallback Author');
    });

    it('falls back to frontmatter author when displayName is empty string', () => {
      const profile = { ...baseProfile, displayName: '' };
      const author = resolveAuthor(basePost, profile);
      expect(author.name).toBe('Fallback Author');
    });

    it('falls back to frontmatter author when displayName is null', () => {
      const profile = {
        ...baseProfile,
        displayName: null,
      } as unknown as ProfileData;
      const author = resolveAuthor(basePost, profile);
      expect(author.name).toBe('Fallback Author');
    });
  });

  describe('title resolution', () => {
    it('always uses frontmatter authorTitle', () => {
      const author = resolveAuthor(basePost, baseProfile);
      expect(author.title).toBe('Founder at Jovie');
    });

    it('returns undefined when no authorTitle in frontmatter', () => {
      const post = { ...basePost, authorTitle: undefined };
      const author = resolveAuthor(post, baseProfile);
      expect(author.title).toBeUndefined();
    });
  });

  describe('avatarUrl resolution', () => {
    it('uses profile avatarUrl when available', () => {
      const author = resolveAuthor(basePost, baseProfile);
      expect(author.avatarUrl).toBe('https://cdn.jov.ie/avatars/tim.jpg');
    });

    it('returns null when profile has no avatarUrl', () => {
      const profile = { ...baseProfile, avatarUrl: null };
      const author = resolveAuthor(basePost, profile);
      expect(author.avatarUrl).toBeNull();
    });

    it('returns null when profile is null', () => {
      const author = resolveAuthor(basePost, null);
      expect(author.avatarUrl).toBeNull();
    });
  });

  describe('profileUrl resolution', () => {
    it('constructs internal path from profile username', () => {
      const author = resolveAuthor(basePost, baseProfile);
      expect(author.profileUrl).toBe('/tim');
    });

    it('falls back to frontmatter authorProfile when no profile', () => {
      const author = resolveAuthor(basePost, null);
      expect(author.profileUrl).toBe('https://jov.ie/tim');
    });

    it('returns undefined when no profile and no authorProfile', () => {
      const post = { ...basePost, authorProfile: undefined };
      const author = resolveAuthor(post, null);
      expect(author.profileUrl).toBeUndefined();
    });
  });

  describe('isVerified resolution', () => {
    it('passes through profile isVerified true', () => {
      const author = resolveAuthor(basePost, baseProfile);
      expect(author.isVerified).toBe(true);
    });

    it('passes through profile isVerified false', () => {
      const profile = { ...baseProfile, isVerified: false };
      const author = resolveAuthor(basePost, profile);
      expect(author.isVerified).toBe(false);
    });

    it('defaults to false when no profile', () => {
      const author = resolveAuthor(basePost, null);
      expect(author.isVerified).toBe(false);
    });
  });
});
