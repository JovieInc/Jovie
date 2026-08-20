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

import { captureWarning, splitCapturedErrorBag } from './error-tracking';

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
});
