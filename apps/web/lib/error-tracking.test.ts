import * as Sentry from '@sentry/nextjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureError,
  captureWarning,
  isNonActionableRedisInfraError,
  unwrapCaptureErrorInput,
} from '@/lib/error-tracking';

function createUpstashError(message: string): Error {
  const error = new Error(message);
  error.name = 'UpstashError';
  return error;
}

describe('unwrapCaptureErrorInput', () => {
  it('extracts a nested UpstashError from a context bag (JOV-5219)', () => {
    const upstash = createUpstashError(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );

    const result = unwrapCaptureErrorInput({ error: upstash });

    expect(result.error).toBe(upstash);
    expect(result.context).toBeUndefined();
    expect(JSON.stringify(result.error)).not.toBe(
      '{"error":{"name":"UpstashError"}}'
    );
  });

  it('moves sibling bag fields into context (JOV-5185)', () => {
    const upstash = createUpstashError(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );

    const result = unwrapCaptureErrorInput({
      clerkUserId: 'af5b9ee0-ecec-4508-86e0-4f364c2e349d',
      error: upstash,
    });

    expect(result.error).toBe(upstash);
    expect(result.context).toEqual({
      clerkUserId: 'af5b9ee0-ecec-4508-86e0-4f364c2e349d',
    });
  });

  it('leaves a real Error argument unchanged', () => {
    const error = new TypeError('boom');
    expect(unwrapCaptureErrorInput(error, { route: '/app' })).toEqual({
      error,
      context: { route: '/app' },
    });
  });
});

describe('isNonActionableRedisInfraError', () => {
  it('matches UpstashError by name', () => {
    expect(isNonActionableRedisInfraError(createUpstashError('nope'))).toBe(
      true
    );
  });

  it('matches the production quota-exceeded message', () => {
    expect(
      isNonActionableRedisInfraError(
        new Error(
          'ERR max requests limit exceeded. Limit: 500000, Usage: 500099'
        )
      )
    ).toBe(true);
  });

  it('does not match unrelated application errors', () => {
    expect(
      isNonActionableRedisInfraError(new TypeError('res.map is not a function'))
    ).toBe(false);
  });
});

describe('captureWarning UpstashError bags', () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    vi.mocked(Sentry.addBreadcrumb).mockClear();
    vi.mocked(Sentry.getClient).mockReturnValue(
      {} as ReturnType<typeof Sentry.getClient>
    );
  });

  it('does not file Error: {"error":{"name":"UpstashError"}}', async () => {
    const upstash = createUpstashError(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );

    await captureWarning('[handle-availability] Redis read failed', {
      error: upstash,
    });

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'redis',
        data: expect.objectContaining({
          error_class: 'redis_infra_warning',
          error_name: 'UpstashError',
        }),
      })
    );
  });

  it('still captures unexpected errors at error severity with the real exception', async () => {
    const error = new TypeError('res.map is not a function');

    await captureError('Audience block check failed', error, {
      route: '/api/profile',
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        extra: expect.objectContaining({
          route: '/api/profile',
        }),
      })
    );
    const captured = vi.mocked(Sentry.captureException).mock.calls[0]?.[0];
    expect(captured).toBe(error);
    expect(String(captured)).not.toContain('{"error":{"name":"UpstashError"}}');
  });

  it('captures an unwrapped UpstashError, not a JSON-stringified bag', async () => {
    const upstash = createUpstashError(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );

    await captureError(
      'Dashboard route error',
      { error: upstash },
      {
        route: '/api/dashboard',
      }
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      upstash,
      expect.objectContaining({
        extra: expect.objectContaining({
          route: '/api/dashboard',
        }),
      })
    );
    const captured = vi.mocked(Sentry.captureException).mock.calls[0]?.[0];
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).name).toBe('UpstashError');
    expect(String(captured)).not.toBe(
      'Error: {"error":{"name":"UpstashError"}}'
    );
  });
});
