import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractStan,
  extractStanHandle,
  isStanUrl,
  normalizeStanHandle,
  validateStanUrl,
} from '@/lib/ingestion/strategies/stan';

const loadFixture = (name: string) =>
  readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('Stan Strategy', () => {
  describe('URL validation', () => {
    it('accepts valid Stan URLs', () => {
      expect(isStanUrl('https://stan.me/creator')).toBe(true);
      expect(isStanUrl('https://www.stan.me/Creator')).toBe(true);
    });

    it('rejects invalid URLs', () => {
      expect(isStanUrl('http://stan.me/creator')).toBe(false);
      expect(isStanUrl('https://example.com/creator')).toBe(false);
      expect(isStanUrl('https://stan.me/')).toBe(false);
    });

    it('normalizes validated URLs', () => {
      expect(validateStanUrl('https://www.stan.me/Creator')).toBe(
        'https://stan.me/creator'
      );
    });
  });

  describe('handle helpers', () => {
    it('extracts and normalizes handles', () => {
      expect(extractStanHandle('https://stan.me/Creator')).toBe('creator');
      expect(normalizeStanHandle('  Creator  ')).toBe('creator');
    });

    it('returns null for unsupported hosts', () => {
      expect(extractStanHandle('https://example.com/user')).toBeNull();
    });
  });

  describe('extractStan', () => {
    it('prefers structured data when available', () => {
      const html = loadFixture('stan-structured.html');
      const result = extractStan(html);

      expect(result.displayName).toBe('Ava Creator');
      expect(result.avatarUrl).toBe('https://cdn.stan.me/avatar.png');
      expect(result.links).toHaveLength(2);
      expect(result.links[0]).toMatchObject({
        url: 'https://instagram.com/avacreator',
        title: 'Instagram',
        sourcePlatform: 'stan',
      });
    });

    it('falls back to link extraction when structured data is missing', () => {
      const html = loadFixture('stan-fallback.html');
      const result = extractStan(html);

      expect(result.displayName).toBe('Mila Artist');
      expect(result.avatarUrl).toBe('https://cdn.stan.me/mila.jpg');
      expect(result.links).toHaveLength(1);
      expect(result.links[0].url).toBe('https://youtube.com/@mila');
    });
  });
});
