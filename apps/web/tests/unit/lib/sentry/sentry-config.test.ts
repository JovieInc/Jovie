/**
 * Unit tests for Sentry Shared Configuration
 *
 * These tests verify the shared configuration utilities including
 * PII scrubbing, beforeSend hooks, and base configurations.
 *
 * @module tests/unit/lib/sentry/sentry-config.test
 */

import { describe, expect, it, vi } from 'vitest';
import { getFullClientConfig } from '@/lib/sentry/client-full';
import { getLiteClientConfig } from '@/lib/sentry/client-lite';
import {
  createBeforeSendHook,
  getBaseClientConfig,
  getBaseServerConfig,
  isClientSide,
  isServerSide,
  SENSITIVE_HEADERS,
  scrubPii,
} from '@/lib/sentry/config';

vi.unmock('@/lib/sentry/client-lite');

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

  it('should filter localhost server noise', () => {
    const event = {
      request: {
        url: 'http://localhost:3000/pricing',
      },
    };

    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter playwright-ci tagged noise', () => {
    const event = {
      tags: {
        source: 'playwright-ci',
      },
      message: 'TimeoutError: locator.waitFor: Timeout 15000ms exceeded.',
    };

    expect(scrubPii(event as any)).toBeNull();
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

  it('should filter client-side UnrecognizedActionError (type field match)', () => {
    // Next.js client throws UnrecognizedActionError when it receives
    // NEXT_ACTION_NOT_FOUND_HEADER from the server. The error type is
    // UnrecognizedActionError; the message is the plain server action not found text.
    const event = {
      exception: {
        values: [
          {
            type: 'UnrecognizedActionError',
            value:
              'Server Action "005a331209a8ea5b575bfbb0957bc1531f71788fae" was not found on the server.',
          },
        ],
      },
    };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter server-side "Failed to find Server Action" errors (E974/E975)', () => {
    // Next.js server-side action-handler.js throws this plain Error when
    // the action manifest lookup fails (deployment skew). The error type is
    // plain Error; the message contains the "Failed to find Server Action" text.
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value:
              'Failed to find Server Action. This request might be from an older or newer deployment.',
          },
        ],
      },
    };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter UnrecognizedActionError with action hash in message', () => {
    // Additional variant: message contains "was not found on the server"
    const event = {
      exception: {
        values: [
          {
            type: 'UnrecognizedActionError',
            value:
              'Server Action "abc123def456" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action',
          },
        ],
      },
    };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter CSP violation events from message (browser extension noise)', () => {
    const event = { message: "Blocked 'script' from 'inline:'" };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter CSP violation events from exception value', () => {
    const event = {
      exception: {
        values: [{ value: "Blocked 'eval' from 'inline:'" }],
      },
    };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter CSP violation when message is non-CSP but exception value is CSP', () => {
    const event = {
      message: 'Generic client error',
      exception: {
        values: [{ value: "Blocked 'script' from 'inline:'" }],
      },
    };
    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter hydration mismatch errors from exception text', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value:
              'Switched to client rendering because the server rendering errored: hydration failed',
          },
        ],
      },
    };

    expect(scrubPii(event as any)).toBeNull();
  });

  it('should filter hydration mismatch errors from top-level message', () => {
    const event = {
      message:
        'Error: Switched to client rendering because the server rendering errored',
    };

    expect(scrubPii(event as any)).toBeNull();
  });
  it('should drop the JOV-5218 UpstashError JSON bag', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: '{"error":{"name":"UpstashError"}}',
          },
        ],
      },
    };

    expect(scrubPii(event as any)).toBeNull();
  });

  it('should drop a prefixed JOV-5228 UpstashError JSON bag', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Unhandled {"error":{"name":"UpstashError"}}',
          },
        ],
      },
    };

    expect(scrubPii(event as any)).toBeNull();
  });

  it('should drop the JOV-5229 title-only UpstashError JSON bag', () => {
    const event = {
      title: 'Error: {"error":{"name":"UpstashError"}}',
    };

    expect(scrubPii(event as any)).toBeNull();
  });

  it('should drop the JOV-5185 clerkUserId-wrapped UpstashError JSON bag', () => {
    const event = {
      title:
        'Error: {"clerkUserId":"af5b9ee0-ecec-4508-86e0-4f364c2e349d","error":{"name":"UpstashError"}}',
    };

    expect(scrubPii(event as any)).toBeNull();
  });

  it('should drop a JOV-5187 object-capture whose originalException is the bag', () => {
    const inner = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );
    inner.name = 'UpstashError';
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Non-Error exception captured with keys: error',
          },
        ],
      },
    };

    expect(
      scrubPii(event as any, { originalException: { error: inner } } as any)
    ).toBeNull();
  });

  it('should drop a JOV-5187 bag kept on extra.__serialized__', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Non-Error exception captured with keys: error',
          },
        ],
      },
      extra: {
        __serialized__: { error: { name: 'UpstashError' } },
      },
    };

    expect(scrubPii(event as any)).toBeNull();
  });

  it('should drop a JOV-5183 bag kept on a non-standard extra key', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Non-Error exception captured with keys: error',
          },
        ],
      },
      extra: {
        ctx: { error: { name: 'UpstashError' } },
      },
    };

    expect(scrubPii(event as any)).toBeNull();
  });

  it('should drop a JOV-5187 logentry.formatted Linear title', () => {
    const event = {
      logentry: {
        formatted: 'Error: {"error":{"name":"UpstashError"}}',
      },
    };

    expect(scrubPii(event as any)).toBeNull();
  });

  it('should drop real Upstash quota exceptions (JOV-5181)', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'UpstashError',
            value:
              'Command failed: ERR max requests limit exceeded. Limit: 500000, Usage: 500099. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details',
          },
        ],
      },
    };

    expect(scrubPii(event as any)).toBeNull();
  });

  it('should keep unrelated Upstash auth failures', () => {
    const event = {
      exception: {
        values: [
          {
            type: 'UpstashError',
            value:
              'WRONGPASS invalid or missing auth token. See https://docs.upstash.com/redis/troubleshooting/http_unauthorized for details.',
          },
        ],
      },
    };

    expect(scrubPii(event as any)).not.toBeNull();
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

  it('drops a generic object-capture whose originalException is the JOV-5185 bag', () => {
    const beforeSend = createBeforeSendHook();
    const inner = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );
    inner.name = 'UpstashError';
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Non-Error exception captured with keys: clerkUserId, error',
          },
        ],
      },
    };
    const hint = {
      originalException: {
        clerkUserId: 'af5b9ee0-ecec-4508-86e0-4f364c2e349d',
        error: inner,
      },
    };

    expect(beforeSend(event as any, hint as any)).toBeNull();
  });

  it('drops a generic object-capture whose originalException is the JOV-5209 bag', () => {
    const beforeSend = createBeforeSendHook();
    const inner = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );
    inner.name = 'UpstashError';
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Non-Error exception captured with keys: error',
          },
        ],
      },
    };
    const hint = { originalException: { error: inner } };

    expect(beforeSend(event as any, hint as any)).toBeNull();
  });

  it('drops the JOV-5187 bag on the client beforeSend path', () => {
    const { beforeSend } = getBaseClientConfig();
    const inner = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );
    inner.name = 'UpstashError';
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Non-Error exception captured with keys: error',
          },
        ],
      },
    };

    expect(
      beforeSend(event as any, { originalException: { error: inner } } as any)
    ).toBeNull();
  });

  it('drops a real quota UpstashError on hint.originalException (JOV-5181)', () => {
    const beforeSend = createBeforeSendHook();
    const error = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000, Usage: 500099. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details'
    );
    error.name = 'UpstashError';
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'An error occurred in the Server Components render',
          },
        ],
      },
    };

    expect(
      beforeSend(event as any, { originalException: error } as any)
    ).toBeNull();
  });
});

// ============================================================================
// Base Configuration Tests
// ============================================================================

describe('getBaseClientConfig', () => {
  it('should return base client configuration', () => {
    const config = getBaseClientConfig();

    expect(config).toHaveProperty('dsn');
    expect(config).toHaveProperty('release');
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

  it('ignores the opaque UpstashError JSON bag on the client (JOV-5228)', () => {
    const config = getBaseClientConfig();
    expect(
      config.ignoreErrors?.some(
        pattern =>
          pattern instanceof RegExp &&
          pattern.test('{"error":{"name":"UpstashError"}}')
      )
    ).toBe(true);
  });

  it('drops the JOV-5263 bounded Spotify credit JSON bag', () => {
    const config = getBaseClientConfig();
    const title =
      'Error: {"source":"spotify_release_credit","creatorProfileId":"c07d767c-1784-4bb7-af6b-2fdfb8a88eb9","processed":24,"limit":24,"retry":"next_spotify_import_or_backfill"}';

    expect(
      config.beforeSend({
        exception: {
          values: [{ type: 'Error', value: title }],
        },
      } as never)
    ).toBeNull();
  });

  it('drops the JOV-5605 Vercel IPC socket refusal', () => {
    const config = getBaseClientConfig();
    expect(
      config.beforeSend({
        exception: {
          values: [
            {
              type: 'Error',
              value: 'connect ECONNREFUSED /opt/vercel/ipc.sock',
            },
          ],
        },
      } as never)
    ).toBeNull();
  });

  it('drops a client object-capture whose originalException is the JOV-5186 bag', () => {
    const config = getBaseClientConfig();
    const inner = new Error(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );
    inner.name = 'UpstashError';
    const event = {
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Non-Error exception captured with keys: error',
          },
        ],
      },
    };

    expect(
      config.beforeSend(
        event as never,
        {
          originalException: { error: inner },
        } as never
      )
    ).toBeNull();
  });

  it('ignores the clerkUserId-wrapped UpstashError JSON bag on the client (JOV-5185)', () => {
    const config = getBaseClientConfig();
    expect(
      config.ignoreErrors?.some(
        pattern =>
          pattern instanceof RegExp &&
          pattern.test(
            'Error: {"clerkUserId":"af5b9ee0-ecec-4508-86e0-4f364c2e349d","error":{"name":"UpstashError"}}'
          )
      )
    ).toBe(true);
  });

  it('tags events with the exact public production release when provided', async () => {
    const release = 'a'.repeat(40);
    vi.stubEnv('NEXT_PUBLIC_SENTRY_RELEASE', release);
    vi.resetModules();

    try {
      const config = await import('@/lib/sentry/config');
      expect(config.getBaseClientConfig().release).toBe(release);
      expect(config.getBaseServerConfig().release).toBe(release);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

function ignoresUpstashJsonBag(
  ignoreErrors: Array<string | RegExp> | undefined
): boolean {
  return Boolean(
    ignoreErrors?.some(
      pattern =>
        pattern instanceof RegExp &&
        pattern.test('{"error":{"name":"UpstashError"}}')
    )
  );
}

describe('client init configs (JOV-5183)', () => {
  it('forwards the UpstashError JSON bag ignoreErrors into lite Sentry.init', () => {
    expect(ignoresUpstashJsonBag(getLiteClientConfig().ignoreErrors)).toBe(
      true
    );
  });

  it('forwards the UpstashError JSON bag ignoreErrors into full Sentry.init', () => {
    expect(
      ignoresUpstashJsonBag(
        getFullClientConfig({
          enableBreadcrumbs: false,
          enableReplay: false,
        }).ignoreErrors
      )
    ).toBe(true);
  });
});

describe('getBaseServerConfig', () => {
  it('should return base server configuration', () => {
    const config = getBaseServerConfig();

    expect(config).toHaveProperty('dsn');
    expect(config).toHaveProperty('release');
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
