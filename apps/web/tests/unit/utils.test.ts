import { describe, expect, it } from 'vitest';
import {
  cn,
  detectPlatformFromUA,
  extractSpotifyId,
  formatDate,
  generateHandle,
  slugify,
} from '@/lib/utils';

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names correctly', () => {
      expect(cn('bg-red-500', 'text-white')).toBe('bg-red-500 text-white');
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
      expect(cn('p-4', undefined, 'm-2', null, 'text-center')).toBe(
        'p-4 m-2 text-center'
      );
      expect(cn()).toBe('');
    });

    it('should handle conditional classes', () => {
      expect(cn('base', true && 'active', false && 'inactive')).toBe(
        'base active'
      );
      expect(cn('base', { active: true, disabled: false })).toBe('base active');
    });
  });

  describe('slugify', () => {
    it('should convert text to slug', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Artist Name!!!')).toBe('artist-name');
      expect(slugify('  spaces  ')).toBe('spaces');
      expect(slugify('Special@#$%^&*()Characters')).toBe('specialcharacters');
      expect(slugify('Multiple   Spaces')).toBe('multiple-spaces');
      expect(slugify('')).toBe('');
    });
  });

  describe('generateHandle', () => {
    it('should generate handle from name', () => {
      expect(generateHandle('The Beatles')).toBe('the-beatles');
      expect(generateHandle('Lady Gaga')).toBe('lady-gaga');
      expect(generateHandle('')).toBe('artist');
      expect(generateHandle('   ')).toBe('artist');
      expect(generateHandle('Dua Lipa')).toBe('dua-lipa');
    });
  });

  describe('extractSpotifyId', () => {
    it('should extract ID from Spotify URLs', () => {
      expect(
        extractSpotifyId(
          'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb'
        )
      ).toBe('4Z8W4fKeB5YxbusRsdQVPb');
      expect(extractSpotifyId('spotify:artist:4Z8W4fKeB5YxbusRsdQVPb')).toBe(
        '4Z8W4fKeB5YxbusRsdQVPb'
      );
      expect(extractSpotifyId('4Z8W4fKeB5YxbusRsdQVPb')).toBe(
        '4Z8W4fKeB5YxbusRsdQVPb'
      );
      expect(extractSpotifyId('invalid-url')).toBeNull();
      expect(extractSpotifyId('')).toBeNull();
    });
  });

  describe('formatDate', () => {
    it('should format dates correctly', () => {
      const date = new Date('2023-12-25T12:00:00Z');
      expect(formatDate(date)).toMatch(/December 25, 2023/);

      const dateString = '2023-12-25T12:00:00Z';
      expect(formatDate(dateString)).toMatch(/December 25, 2023/);
    });
  });

  describe('detectPlatformFromUA', () => {
    it('should detect platform from user agent', () => {
      expect(
        detectPlatformFromUA(
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X)'
        )
      ).toBe('ios');
      expect(detectPlatformFromUA('Mozilla/5.0 (Linux; Android 10)')).toBe(
        'android'
      );
      expect(
        detectPlatformFromUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      ).toBe('macos');
      expect(detectPlatformFromUA('Mozilla/5.0 (Windows NT 10.0)')).toBe(
        'windows'
      );
      expect(detectPlatformFromUA('Mozilla/5.0 (X11; Linux x86_64)')).toBe(
        'linux'
      );
      expect(detectPlatformFromUA('Mozilla/5.0')).toBe('web');
      expect(detectPlatformFromUA(undefined)).toBeNull();
      expect(detectPlatformFromUA('')).toBeNull();
    });
  });
});
