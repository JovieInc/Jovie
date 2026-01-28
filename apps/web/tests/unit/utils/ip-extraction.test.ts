import { describe, expect, it } from 'vitest';
import { extractClientIP, isValidIP } from '@/lib/utils/ip-extraction';

describe('ip-extraction', () => {
  describe('isValidIP', () => {
    it('validates IPv4 addresses with octet ranges', () => {
      expect(isValidIP('127.0.0.1')).toBe(true);
      expect(isValidIP('001.002.003.004')).toBe(true);
      expect(isValidIP('256.0.0.1')).toBe(false);
      expect(isValidIP('192.168.1')).toBe(false);
    });

    it('validates IPv6 addresses including compressed forms', () => {
      expect(isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      expect(isValidIP('::1')).toBe(true);
      expect(isValidIP('2001:db8::g')).toBe(false);
    });
  });

  describe('extractClientIP', () => {
    it('prefers trusted headers and validates the first forwarded IP', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '203.0.113.1, 70.41.3.18');
      expect(extractClientIP(headers)).toBe('203.0.113.1');
    });

    it('falls back to unknown when headers are invalid', () => {
      const headers = new Headers();
      headers.set('cf-connecting-ip', 'not-an-ip');
      expect(extractClientIP(headers)).toBe('unknown');
    });
  });
});
