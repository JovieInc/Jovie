import { describe, expect, it } from 'vitest';
import { extractClientIP, isValidIP } from '@/lib/utils/ip-extraction';

describe('ip-extraction', () => {
  describe('isValidIP', () => {
    it('validates IPv4 addresses with numeric bounds', () => {
      expect(isValidIP('203.0.113.1')).toBe(true);
      expect(isValidIP('255.255.255.255')).toBe(true);
      expect(isValidIP('256.0.0.1')).toBe(false);
      expect(isValidIP('1.2.3')).toBe(false);
    });

    it('validates IPv6 addresses in full and compressed forms', () => {
      expect(isValidIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      expect(isValidIP('2001:db8::1')).toBe(true);
      expect(isValidIP('2001:db8:::1')).toBe(false);
      expect(isValidIP('gggg::1')).toBe(false);
    });
  });

  describe('extractClientIP', () => {
    it('prioritizes trusted headers before forwarded-for', () => {
      const headers = new Headers({
        'x-forwarded-for': '203.0.113.9, 70.41.3.18',
        'x-real-ip': '203.0.113.7',
        'cf-connecting-ip': '203.0.113.5',
        'true-client-ip': '203.0.113.11',
      });

      expect(extractClientIP(headers)).toBe('203.0.113.5');
    });

    it('falls back to first valid forwarded-for address', () => {
      const headers = new Headers({
        'x-forwarded-for': '198.51.100.44, 203.0.113.9',
      });

      expect(extractClientIP(headers)).toBe('198.51.100.44');
    });

    it('returns unknown when no valid IP is present', () => {
      const headers = new Headers({
        'x-forwarded-for': 'not-an-ip',
      });

      expect(extractClientIP(headers)).toBe('unknown');
    });
  });
});
