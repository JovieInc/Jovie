import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captureException, getClient } = vi.hoisted(() => ({
  captureException: vi.fn(),
  getClient: vi.fn().mockReturnValue({}),
}));

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
  captureException,
  getClient,
}));

vi.mock('@/lib/sentry/init', () => ({
  getSentryMode: vi.fn().mockReturnValue('full'),
  isSentryInitialized: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/analytics/runtime-aware', () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
  captureError,
  captureWarning,
  splitCapturedErrorBag,
} from './error-tracking';

class UpstashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstashError';
  }
}

describe('splitCapturedErrorBag', () => {
  it('unwraps { error: UpstashError } into the Error instance (JOV-5221)', () => {
    const inner = new UpstashError(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );
    expect(JSON.stringify({ error: inner })).toBe(
      '{"error":{"name":"UpstashError"}}'
    );

    const split = splitCapturedErrorBag({ error: inner });
    expect(split.error).toBe(inner);
    expect(split.context).toBeUndefined();
  });

  it('keeps sibling fields as context so clerkUserId is not the Sentry title', () => {
    const inner = new UpstashError(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );
    const split = splitCapturedErrorBag({
      clerkUserId: 'af5b9ee0-ecec-4508-86e0-4f364c2e349d',
      error: inner,
    });
    expect(split.error).toBe(inner);
    expect(split.context).toEqual({
      clerkUserId: 'af5b9ee0-ecec-4508-86e0-4f364c2e349d',
    });
  });

  it('leaves real Error instances unchanged', () => {
    const error = new Error('boom');
    expect(splitCapturedErrorBag(error)).toEqual({ error });
  });
});

describe('captureWarning quota noise (JOV-5221)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClient.mockReturnValue({});
  });

  it('does not send the JSON UpstashError bag to Sentry', async () => {
    const inner = new UpstashError(
      'Command failed: ERR max requests limit exceeded. Limit: 500000'
    );
    await captureWarning('[handle-availability] Redis read failed', {
      error: inner,
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('still sends unrelated warnings to Sentry', async () => {
    await captureWarning('Feature flag override read failed', new Error('db'));
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'db' }),
      expect.objectContaining({ level: 'warning' })
    );
  });

  it('does not send expected Spotify credit bounding receipts (JOV-5263)', async () => {
    await captureWarning('Credited artist profile reconciliation was bounded', {
      creatorProfileId: 'c07d767c-1784-4bb7-af6b-2fdfb8a88eb9',
      limit: 24,
      processed: 24,
      retry: 'next_spotify_import_or_backfill',
      source: 'spotify_release_credit',
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not title context-only bags as Error JSON (JOV-5263)', async () => {
    await captureWarning(
      'Credited artist profile identity conflicts detected',
      {
        conflicted: 1,
        creatorProfileId: 'owner-profile',
        source: 'spotify_release_credit',
      }
    );
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Credited artist profile identity conflicts detected',
      }),
      expect.objectContaining({
        extra: expect.objectContaining({
          conflicted: 1,
          creatorProfileId: 'owner-profile',
          source: 'spotify_release_credit',
        }),
        level: 'warning',
      })
    );
  });
});

describe('captureError wrapped UpstashError (JOV-5220)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClient.mockReturnValue({});
  });

  it('does not send the opaque JSON bag at error severity (JOV-5229)', async () => {
    await captureError(
      '[db-cache] Redis read failed',
      new Error('{"error":{"name":"UpstashError"}}')
    );
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not send quota-exceeded UpstashError at error severity (JOV-5181)', async () => {
    const inner = new UpstashError(
      'ERR max requests limit exceeded. Limit: 500000, Usage: 500099. See https://upstash.com/docs/redis/troubleshooting/max_requests_limit for details'
    );

    await captureError('[waitlist-gate] Redis cache read failed', {
      error: inner,
    });

    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not send a clerkUserId-wrapped quota failure at error severity', async () => {
    const inner = new UpstashError(
      'ERR max requests limit exceeded. Limit: 500000, Usage: 500099'
    );

    await captureError('[ban-check] Redis cache read failed', {
      clerkUserId: 'af5b9ee0-ecec-4508-86e0-4f364c2e349d',
      error: inner,
    });

    expect(captureException).not.toHaveBeenCalled();
  });

  it('moves clerkUserId from the wrapper into Sentry extra, not the title', async () => {
    const inner = new UpstashError('WRONGPASS invalid or missing auth token');

    await captureError('[ban-check] Redis cache read failed', {
      clerkUserId: 'af5b9ee0-ecec-4508-86e0-4f364c2e349d',
      error: inner,
    });

    const [captured, options] = captureException.mock.calls[0] as [
      Error,
      { extra?: Record<string, unknown> },
    ];
    expect(captured).toBe(inner);
    expect(options.extra?.clerkUserId).toBe(
      'af5b9ee0-ecec-4508-86e0-4f364c2e349d'
    );
  });

  it('still sends unrelated Redis auth failures at error severity', async () => {
    const inner = new UpstashError(
      'WRONGPASS invalid or missing auth token. See https://docs.upstash.com/redis/troubleshooting/http_unauthorized for details.'
    );

    await captureError('[ban-check] Redis cache read failed', inner);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[0]).toBe(inner);
  });

  it('does not send an already-stringified JSON bag at error severity (JOV-5228)', async () => {
    await captureError(
      '[onRequestError] Redis failed',
      new Error('{"error":{"name":"UpstashError"}}')
    );
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not send the clerkUserId-wrapped JSON bag at error severity (JOV-5185)', async () => {
    await captureError(
      '[ban-check] Redis cache read failed',
      new Error(
        '{"clerkUserId":"af5b9ee0-ecec-4508-86e0-4f364c2e349d","error":{"name":"UpstashError"}}'
      )
    );
    expect(captureException).not.toHaveBeenCalled();
  });
});
