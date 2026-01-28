import { describe, expect, it } from 'vitest';
import { extractClientIP, isValidIP } from '@/lib/utils/ip-extraction';

describe('ip-extraction', () => {
  describe('isValidIP', () => {
    it('validates IPv4 addresses via octet ranges', () => {
      expect(isValidIP('127.0.0.1')).toBe(true);
      expect(isValidIP('255.255.255.255')).toBe(true);
      expect(isValidIP('0.0.0.0')).toBe(true);
      expect(isValidIP('256.0.0.1')).toBe(false);
      expect(isValidIP('192.168.1')).toBe(false);
      expect(isValidIP('192.168.1.1.1')).toBe(false);
    });

    it('validates common IPv6 formats', () => {
      expect(isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      expect(isValidIP('2001:db8::1')).toBe(true);
      expect(isValidIP('2001:db8:::1')).toBe(false);
    });
  });

  describe('extractClientIP', () => {
    it('returns the first valid proxy header in priority order', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '203.0.113.10, 70.41.3.18');
      headers.set('x-real-ip', '198.51.100.9');
      headers.set('cf-connecting-ip', '192.0.2.1');

      expect(extractClientIP(headers)).toBe('192.0.2.1');
    });

    it('falls back to forwarded-for when higher priority headers are invalid', () => {
      const headers = new Headers();
      headers.set('cf-connecting-ip', '999.0.0.1');
      headers.set('x-real-ip', 'not-an-ip');
      headers.set('x-forwarded-for', '203.0.113.10, 70.41.3.18');

      expect(extractClientIP(headers)).toBe('203.0.113.10');
    });
  });
});
