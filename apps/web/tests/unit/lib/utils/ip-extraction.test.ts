import { describe, expect, it } from 'vitest';
import { extractClientIP, isValidIP } from '@/lib/utils/ip-extraction';

describe('ip-extraction', () => {
  describe('isValidIP', () => {
    it('accepts valid IPv4 addresses', () => {
      expect(isValidIP('192.168.1.1')).toBe(true);
      expect(isValidIP('255.255.255.255')).toBe(true);
    });

    it('rejects invalid IPv4 addresses', () => {
      expect(isValidIP('999.168.1.1')).toBe(false);
      expect(isValidIP('192.168.1')).toBe(false);
      expect(isValidIP('192.168.1.a')).toBe(false);
    });

    it('accepts IPv6 addresses', () => {
      expect(isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      expect(isValidIP('2001:db8::1')).toBe(true);
    });

    it('rejects invalid IPv6 addresses', () => {
      expect(isValidIP('2001:::1')).toBe(false);
    });
  });

  describe('extractClientIP', () => {
    it('prefers cf-connecting-ip when valid', () => {
      const headers = new Headers({
        'cf-connecting-ip': '203.0.113.5',
        'x-real-ip': '198.51.100.2',
      });

      expect(extractClientIP(headers)).toBe('203.0.113.5');
    });

    it('uses the first x-forwarded-for IP when needed', () => {
      const headers = new Headers({
        'x-forwarded-for': '203.0.113.1, 198.51.100.2',
      });

      expect(extractClientIP(headers)).toBe('203.0.113.1');
    });

    it('returns unknown when no valid IP is found', () => {
      const headers = new Headers({
        'x-forwarded-for': '999.0.0.1, 203.0.113.2',
      });

      expect(extractClientIP(headers)).toBe('unknown');
    });
  });
});
