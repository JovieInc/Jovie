/**
 * Tracking Token Tests
 * Validates HMAC-SHA256 signed request tokens for audience tracking endpoints
 */

import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateTrackingToken,
  getClientTrackingToken,
  isTrackingTokenEnabled,
  TrackingTokenError,
  validateTrackingToken,
} from '@/lib/analytics/tracking-token';

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

describe('Tracking Token', () => {
  describe('isTrackingTokenEnabled', () => {
    it('should return false when TRACKING_TOKEN_SECRET is not set', () => {
      const originalEnv = process.env.TRACKING_TOKEN_SECRET;
      delete process.env.TRACKING_TOKEN_SECRET;

      expect(isTrackingTokenEnabled()).toBe(false);

      if (originalEnv) {
        process.env.TRACKING_TOKEN_SECRET = originalEnv;
      }
    });

    it('should return true when TRACKING_TOKEN_SECRET is set', () => {
      const originalEnv = process.env.TRACKING_TOKEN_SECRET;
      process.env.TRACKING_TOKEN_SECRET = 'test-secret-key-for-signing';

      expect(isTrackingTokenEnabled()).toBe(true);

      if (originalEnv) {
        process.env.TRACKING_TOKEN_SECRET = originalEnv;
      } else {
        delete process.env.TRACKING_TOKEN_SECRET;
      }
    });
  });

  describe('generateTrackingToken', () => {
    beforeEach(() => {
      process.env.TRACKING_TOKEN_SECRET = 'test-secret-key-for-signing';
    });

    it('should generate a valid token format', () => {
      const profileId = '550e8400-e29b-41d4-a716-446655440000';

      const token = generateTrackingToken(profileId);

      expect(token).not.toBeNull();
      const parts = token!.split(':');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe(profileId);
      expect(parseInt(parts[1], 10)).toBeGreaterThan(0);
      expect(parts[2].length).toBe(64); // SHA-256 hex
    });

    it('should generate different tokens for different profiles', () => {
      const token1 = generateTrackingToken('profile-1');
      const token2 = generateTrackingToken('profile-2');

      expect(token1).not.toBe(token2);
    });

    it('should include current timestamp', () => {
      const profileId = 'test-profile';
      const before = Date.now();

      const token = generateTrackingToken(profileId);

      const after = Date.now();
      const timestamp = parseInt(token!.split(':')[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('validateTrackingToken', () => {
    beforeEach(() => {
      process.env.TRACKING_TOKEN_SECRET = 'test-secret-key-for-signing';
    });

    it('should validate a valid token', () => {
      const profileId = 'test-profile-id';
      const token = generateTrackingToken(profileId);

      const result = validateTrackingToken(token!);

      expect(result.valid).toBe(true);
      expect(result.payload).toBeDefined();
      expect(result.payload?.profileId).toBe(profileId);
    });

    it('should validate token with expected profile ID', () => {
      const profileId = 'test-profile-id';
      const token = generateTrackingToken(profileId);

      const result = validateTrackingToken(token!, profileId);

      expect(result.valid).toBe(true);
    });

    it('should reject token with mismatched profile ID', () => {
      const token = generateTrackingToken('profile-1');

      const result = validateTrackingToken(token!, 'profile-2');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Profile ID mismatch');
    });

    it('should reject null or undefined tokens', () => {
      expect(validateTrackingToken(null).valid).toBe(false);
      expect(validateTrackingToken(undefined).valid).toBe(false);
      expect(validateTrackingToken('').valid).toBe(false);
    });

    it('should reject malformed tokens', () => {
      expect(validateTrackingToken('invalid-token').valid).toBe(false);
      expect(validateTrackingToken('a:b').valid).toBe(false);
      expect(validateTrackingToken('a:b:c:d').valid).toBe(false);
    });

    it('should reject tokens with invalid timestamps', () => {
      const result = validateTrackingToken('profile:notanumber:signature');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid timestamp');
    });

    it('should reject expired tokens', () => {
      const profileId = 'test-profile';
      const expiredTimestamp = Date.now() - 10 * 60 * 1000; // 10 minutes ago

      // Create a token with expired timestamp
      const expiredToken = `${profileId}:${expiredTimestamp}:fakesignature`;

      const result = validateTrackingToken(expiredToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token expired');
    });

    it('should reject tokens with future timestamps beyond threshold', () => {
      const profileId = 'test-profile';
      const futureTimestamp = Date.now() + 60 * 1000; // 1 minute in future

      const futureToken = `${profileId}:${futureTimestamp}:fakesignature`;

      const result = validateTrackingToken(futureToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token timestamp in future');
    });

    it('should reject tokens with invalid signatures', () => {
      const profileId = 'test-profile';
      const timestamp = Date.now();
      const invalidSignature = 'a'.repeat(64); // Valid format but wrong signature

      const tamperedToken = `${profileId}:${timestamp}:${invalidSignature}`;

      const result = validateTrackingToken(tamperedToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });
  });

  describe('getClientTrackingToken', () => {
    beforeEach(() => {
      process.env.TRACKING_TOKEN_SECRET = 'test-secret-key-for-signing';
    });

    it('should return token and expiration time', () => {
      const profileId = 'test-profile';
      const before = Date.now();

      const result = getClientTrackingToken(profileId);

      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeGreaterThan(before);
      expect(result.expiresAt).toBeLessThanOrEqual(
        before + 5 * 60 * 1000 + 100
      );
    });

    it('should generate valid token for client use', () => {
      const profileId = 'test-profile';

      const { token } = getClientTrackingToken(profileId);
      const validation = validateTrackingToken(token!, profileId);

      expect(validation.valid).toBe(true);
    });
  });

  describe('when TRACKING_TOKEN_SECRET is not configured', () => {
    const originalSecret = process.env.TRACKING_TOKEN_SECRET;

    afterEach(() => {
      if (originalSecret) {
        process.env.TRACKING_TOKEN_SECRET = originalSecret;
      } else {
        delete process.env.TRACKING_TOKEN_SECRET;
      }
      vi.unstubAllEnvs();
      vi.clearAllMocks();
    });

    it('should return null instead of throwing in non-development environments', () => {
      delete process.env.TRACKING_TOKEN_SECRET;
      vi.stubEnv('NODE_ENV', 'production');

      expect(() => generateTrackingToken('profile-id')).not.toThrow();
      expect(generateTrackingToken('profile-id')).toBeNull();
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'tracking-token',
          message: 'TRACKING_TOKEN_SECRET not set - skipping token generation',
        })
      );
    });

    it('should return null client token payload in non-development environments', () => {
      delete process.env.TRACKING_TOKEN_SECRET;
      vi.stubEnv('NODE_ENV', 'production');

      expect(getClientTrackingToken('profile-id')).toEqual({
        token: null,
        expiresAt: null,
      });
    });

    it('should return dev token in development without throwing', () => {
      delete process.env.TRACKING_TOKEN_SECRET;
      vi.stubEnv('NODE_ENV', 'development');

      const token = generateTrackingToken('profile-id');

      expect(token).toMatch(/^profile-id:\d+:dev$/);
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'tracking-token',
          message: 'TRACKING_TOKEN_SECRET not set - using dev token',
        })
      );
    });

    it('should validate dev tokens in development', () => {
      delete process.env.TRACKING_TOKEN_SECRET;
      vi.stubEnv('NODE_ENV', 'development');

      const token = generateTrackingToken('profile-id');
      const validation = validateTrackingToken(token!, 'profile-id');

      expect(validation.valid).toBe(true);
      expect(validation.payload?.profileId).toBe('profile-id');
    });

    it('should reject validation when secret is unset outside development', () => {
      delete process.env.TRACKING_TOKEN_SECRET;
      vi.stubEnv('NODE_ENV', 'production');

      const validation = validateTrackingToken(
        'profile-id:123:dev',
        'profile-id'
      );

      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Token validation not configured');
    });
  });

  describe('TrackingTokenError', () => {
    it('should be an instance of Error', () => {
      const error = new TrackingTokenError('test error');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TrackingTokenError');
      expect(error.message).toBe('test error');
    });
  });
});
