import { describe, expect, it } from 'vitest';
import { extractClientIP, isValidIP } from '@/lib/utils/ip-extraction';

describe('ip-extraction', () => {
  describe('isValidIP', () => {
    it('accepts valid IPv4 addresses', () => {
      expect(isValidIP('203.0.113.1')).toBe(true);
      expect(isValidIP('0.0.0.0')).toBe(true);
      expect(isValidIP('255.255.255.255')).toBe(true);
    });

    it('rejects invalid IPv4 addresses', () => {
      expect(isValidIP('256.0.0.1')).toBe(false);
      expect(isValidIP('999.999.999.999')).toBe(false);
      expect(isValidIP('1.2.3')).toBe(false);
    });

    it('accepts valid IPv6 addresses', () => {
      expect(isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      expect(isValidIP('2001:db8::1')).toBe(true);
      expect(isValidIP('::')).toBe(true);
    });

    it('rejects invalid IPv6 addresses', () => {
      expect(isValidIP('2001:db8:::1')).toBe(false);
      expect(isValidIP('2001:db8::g1')).toBe(false);
    });
  });

  describe('extractClientIP', () => {
    it('prefers cf-connecting-ip over other headers', () => {
      const headers = new Headers({
        'cf-connecting-ip': '203.0.113.10',
        'x-real-ip': '198.51.100.20',
        'x-forwarded-for': '198.51.100.30',
      });

      expect(extractClientIP(headers)).toBe('203.0.113.10');
    });

    it('uses the first x-forwarded-for entry when present', () => {
      const headers = new Headers({
        'x-forwarded-for': '198.51.100.1, 203.0.113.2',
      });

      expect(extractClientIP(headers)).toBe('198.51.100.1');
    });

    it('returns unknown when no valid IP is present', () => {
      const headers = new Headers({
        'x-real-ip': '999.999.999.999',
      });

      expect(extractClientIP(headers)).toBe('unknown');
    });
  });
});
