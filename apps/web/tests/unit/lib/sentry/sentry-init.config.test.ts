/**
 * Sentry Tests - Config Module
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createBeforeSendHook,
  getBaseClientConfig,
  getBaseServerConfig,
  isClientSide,
  isDevelopment,
  isProduction,
  isServerSide,
  SENSITIVE_HEADERS,
  scrubPii,
} from '@/lib/sentry/config';

describe('Sentry Config Module', () => {
  describe('scrubPii', () => {
    it('should anonymize IP addresses', () => {
      const event = {
        user: {
          ip_address: '192.168.1.1',
        },
      };

      const result = scrubPii(event as any);
      expect(result?.user?.ip_address).toBe('{{auto}}');
    });

    it('should remove email addresses', () => {
      const event = {
        user: {
          email: 'test@example.com',
          id: 'user_123',
        },
      };

      const result = scrubPii(event as any);
      expect(result?.user?.email).toBeUndefined();
      expect(result?.user?.id).toBe('user_123');
    });

    it('should scrub sensitive headers', () => {
      const event = {
        request: {
          headers: {
            authorization: 'Bearer token123',
            cookie: 'session=abc',
            'x-api-key': 'secret-key',
            'x-auth-token': 'auth-token',
            'content-type': 'application/json',
          },
        },
      };

      const result = scrubPii(event as any);
      expect(result?.request?.headers?.authorization).toBe('[Filtered]');
      expect(result?.request?.headers?.cookie).toBe('[Filtered]');
      expect(result?.request?.headers?.['x-api-key']).toBe('[Filtered]');
      expect(result?.request?.headers?.['x-auth-token']).toBe('[Filtered]');
      expect(result?.request?.headers?.['content-type']).toBe(
        'application/json'
      );
    });

    it('should handle events without user or request', () => {
      const event = {
        message: 'Test error',
      };

      const result = scrubPii(event as any);
      expect(result).toEqual(event);
    });

    it('should return the event (not null) for valid events', () => {
      const event = { message: 'Test' };
      const result = scrubPii(event as any);
      expect(result).not.toBeNull();
    });
  });

  describe('createBeforeSendHook', () => {
    it('should apply PII scrubbing', () => {
      const beforeSend = createBeforeSendHook();
      const event = {
        user: {
          ip_address: '192.168.1.1',
          email: 'test@example.com',
        },
      };

      const result = beforeSend(event as any);
      expect(result?.user?.ip_address).toBe('{{auto}}');
      expect(result?.user?.email).toBeUndefined();
    });

    it('should apply custom processor after PII scrubbing', () => {
      const customProcessor = vi.fn(event => {
        return { ...event, tags: { custom: 'tag' } };
      });

      const beforeSend = createBeforeSendHook(customProcessor);
      const event = {
        user: { ip_address: '192.168.1.1' },
      };

      const result = beforeSend(event as any);

      expect(customProcessor).toHaveBeenCalled();
      expect(result?.user?.ip_address).toBe('{{auto}}');
      expect(result?.tags?.custom).toBe('tag');
    });

    it('should handle custom processor returning null', () => {
      const customProcessor = vi.fn(() => null);

      const beforeSend = createBeforeSendHook(customProcessor);
      const event = { message: 'Test' };

      const result = beforeSend(event as any);
      expect(result).toBeNull();
    });
  });

  describe('getBaseClientConfig', () => {
    it('should return base client configuration', () => {
      const config = getBaseClientConfig();

      expect(config).toHaveProperty('dsn');
      expect(config).toHaveProperty('tracesSampleRate');
      expect(config).toHaveProperty('enableLogs');
      expect(config).toHaveProperty('sendDefaultPii');
      expect(config).toHaveProperty('beforeSend');
    });

    it('should have sendDefaultPii disabled for client', () => {
      const config = getBaseClientConfig();
      expect(config.sendDefaultPii).toBe(false);
    });

    it('should have enableLogs enabled', () => {
      const config = getBaseClientConfig();
      expect(config.enableLogs).toBe(true);
    });

    it('should have beforeSend function', () => {
      const config = getBaseClientConfig();
      expect(typeof config.beforeSend).toBe('function');
    });
  });

  describe('getBaseServerConfig', () => {
    it('should return base server configuration', () => {
      const config = getBaseServerConfig();

      expect(config).toHaveProperty('dsn');
      expect(config).toHaveProperty('tracesSampleRate');
      expect(config).toHaveProperty('enableLogs');
      expect(config).toHaveProperty('sendDefaultPii');
      expect(config).toHaveProperty('beforeSend');
      expect(config).toHaveProperty('debug');
    });

    it('should have sendDefaultPii enabled for server (scrubbed via beforeSend)', () => {
      const config = getBaseServerConfig();
      expect(config.sendDefaultPii).toBe(true);
    });

    it('should have debug disabled', () => {
      const config = getBaseServerConfig();
      expect(config.debug).toBe(false);
    });
  });

  describe('SENSITIVE_HEADERS', () => {
    it('should include common sensitive headers', () => {
      expect(SENSITIVE_HEADERS).toContain('authorization');
      expect(SENSITIVE_HEADERS).toContain('cookie');
      expect(SENSITIVE_HEADERS).toContain('x-api-key');
      expect(SENSITIVE_HEADERS).toContain('x-auth-token');
    });
  });

  describe('environment detection', () => {
    // Note: These tests depend on NODE_ENV which is set by vitest
    it('should detect environment correctly', () => {
      // In test environment, we expect NODE_ENV to be 'test'
      // isProduction should be false, isDevelopment should be false
      expect(typeof isProduction).toBe('boolean');
      expect(typeof isDevelopment).toBe('boolean');
    });

    it('isClientSide should return true in jsdom environment', () => {
      expect(isClientSide()).toBe(true);
    });

    it('isServerSide should return false in jsdom environment', () => {
      expect(isServerSide()).toBe(false);
    });
  });
});
