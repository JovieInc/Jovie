/**
 * Unit tests for Sentry Shared Configuration
 *
 * These tests verify the shared configuration utilities including
 * PII scrubbing, beforeSend hooks, and base configurations.
 *
 * @module tests/unit/lib/sentry/sentry-config.test
 */

import { describe, expect, it, vi } from 'vitest';

// Import config functions
import {
  createBeforeSendHook,
  getBaseClientConfig,
  getBaseServerConfig,
  isClientSide,
  isServerSide,
  SENSITIVE_HEADERS,
  scrubPii,
} from '@/lib/sentry/config';

// ============================================================================
// PII Scrubbing Tests
// ============================================================================

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
    expect(result?.request?.headers?.['content-type']).toBe('application/json');
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

  it('should filter deployment transition ReferenceErrors', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'ReferenceError',
            value: 'someNewChunkVariable is not defined',
          },
        ],
      },
    };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should not filter non-ReferenceError "is not defined" errors', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'x is not defined',
          },
        ],
      },
    };
    expect(scrubPii(event as any)).not.toBeNull();
  });

  it('should filter ChunkLoadError errors', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'ChunkLoadError',
            value: 'Loading chunk 123 failed',
          },
        ],
      },
    };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter "loading chunk" errors regardless of type', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Loading chunk abc-123 failed after 3 retries',
          },
        ],
      },
    };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter CSS chunk loading errors', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Loading CSS chunk main-abc123 failed',
          },
        ],
      },
    };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter framework internal errors', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'HeadCacheNode error in reconciler',
          },
        ],
      },
    };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should scrub sensitive query parameters from request URL', () => {
    const event = {
      request: {
        url: 'https://example.com/api?token=secret123&page=1',
      },
    };
    const result = scrubPii(event as any);
    expect(result?.request?.url).not.toContain('secret123');
    expect(result?.request?.url).toContain('page=1');
  });

  it('should scrub sensitive query parameters from query_string', () => {
    const event = {
      request: {
        query_string: 'api_key=my-secret&limit=10',
      },
    };
    const result = scrubPii(event as any);
    expect(result?.request?.query_string).not.toContain('my-secret');
  });

  it('should preserve other user properties', () => {
    const event = {
      user: {
        id: 'user_123',
        username: 'testuser',
        ip_address: '192.168.1.1',
        email: 'test@example.com',
      },
    };

    const result = scrubPii(event as any);
    expect(result?.user?.id).toBe('user_123');
    expect(result?.user?.username).toBe('testuser');
  });
});

// ============================================================================
// BeforeSend Hook Tests
// ============================================================================

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

  it('should pass hint to custom processor', () => {
    const customProcessor = vi.fn((event, hint) => {
      expect(hint).toBeDefined();
      return event;
    });

    const beforeSend = createBeforeSendHook(customProcessor);
    const event = { message: 'Test' };
    const hint = { originalException: new Error('test') };

    beforeSend(event as any, hint as any);
    expect(customProcessor).toHaveBeenCalledWith(expect.anything(), hint);
  });
});

// ============================================================================
// Base Configuration Tests
// ============================================================================

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

  it('should have tracesSampleRate as a number', () => {
    const config = getBaseClientConfig();
    expect(typeof config.tracesSampleRate).toBe('number');
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

  it('should have enableLogs enabled', () => {
    const config = getBaseServerConfig();
    expect(config.enableLogs).toBe(true);
  });
});

// ============================================================================
// Sensitive Headers Tests
// ============================================================================

describe('SENSITIVE_HEADERS', () => {
  it('should include common sensitive headers', () => {
    expect(SENSITIVE_HEADERS).toContain('authorization');
    expect(SENSITIVE_HEADERS).toContain('cookie');
    expect(SENSITIVE_HEADERS).toContain('x-api-key');
    expect(SENSITIVE_HEADERS).toContain('x-auth-token');
  });

  it('should be a readonly array', () => {
    expect(Array.isArray(SENSITIVE_HEADERS)).toBe(true);
    expect(SENSITIVE_HEADERS.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Environment Detection Tests
// ============================================================================

describe('environment detection', () => {
  it('isClientSide should return true in jsdom environment', () => {
    expect(isClientSide()).toBe(true);
  });

  it('isServerSide should return false in jsdom environment', () => {
    expect(isServerSide()).toBe(false);
  });

  it('isClientSide and isServerSide should be mutually exclusive', () => {
    expect(isClientSide()).not.toBe(isServerSide());
  });
});
