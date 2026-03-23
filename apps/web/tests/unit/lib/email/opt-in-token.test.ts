import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env-server', () => ({
  env: {
    RESEND_API_KEY: 'test-resend-api-key-for-unit-tests',
  },
}));

vi.mock('@/constants/domains', () => ({
  BASE_URL: 'https://test.jov.ie',
}));

describe('opt-in-token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateOptInToken + verifyOptInToken roundtrip', () => {
    it('generates a token and verifies it successfully', async () => {
      const { generateOptInToken, verifyOptInToken } = await import(
        '@/lib/email/opt-in-token'
      );

      const token = generateOptInToken('Fan@Example.com', 'profile-uuid-123');
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token).toContain('.');

      const result = verifyOptInToken(token!);
      expect(result).toEqual({
        email: 'fan@example.com',
        profileId: 'profile-uuid-123',
      });
    });

    it('normalizes email to lowercase and trimmed', async () => {
      const { generateOptInToken, verifyOptInToken } = await import(
        '@/lib/email/opt-in-token'
      );

      const token = generateOptInToken('  USER@Test.COM  ', 'pid');
      const result = verifyOptInToken(token!);
      expect(result?.email).toBe('user@test.com');
    });
  });

  describe('verifyOptInToken rejects invalid tokens', () => {
    it('rejects a tampered HMAC', async () => {
      const { generateOptInToken, verifyOptInToken } = await import(
        '@/lib/email/opt-in-token'
      );

      const token = generateOptInToken('a@b.com', 'pid');
      expect(token).toBeTruthy();
      const [payload] = token!.split('.');
      const tampered = `${payload}.0000000000000000`;

      expect(verifyOptInToken(tampered)).toBeNull();
    });

    it('rejects a token with no dot separator', async () => {
      const { verifyOptInToken } = await import('@/lib/email/opt-in-token');
      expect(verifyOptInToken('nodothere')).toBeNull();
    });

    it('rejects a token with empty parts', async () => {
      const { verifyOptInToken } = await import('@/lib/email/opt-in-token');
      expect(verifyOptInToken('.abc')).toBeNull();
      expect(verifyOptInToken('abc.')).toBeNull();
    });

    it('rejects a token where payload has no @ in email', async () => {
      const { verifyOptInToken } = await import('@/lib/email/opt-in-token');
      // Manually craft a base64url payload with no @ in email portion
      const payload = Buffer.from('noemail:pid').toString('base64url');
      expect(verifyOptInToken(`${payload}.0000000000000000`)).toBeNull();
    });

    it('rejects a token where payload has no colon separator', async () => {
      const { verifyOptInToken } = await import('@/lib/email/opt-in-token');
      const payload = Buffer.from('nocolon').toString('base64url');
      expect(verifyOptInToken(`${payload}.0000000000000000`)).toBeNull();
    });
  });

  describe('buildOptInUrl', () => {
    it('builds a full URL with encoded token', async () => {
      const { buildOptInUrl } = await import('@/lib/email/opt-in-token');
      const url = buildOptInUrl('fan@example.com', 'pid');

      expect(url).toBeTruthy();
      expect(url).toMatch(
        /^https:\/\/test\.jov\.ie\/api\/audience\/opt-in\?token=/
      );
    });
  });
});
