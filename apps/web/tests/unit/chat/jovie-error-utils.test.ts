import { describe, expect, it } from 'vitest';

import {
  extractErrorMetadata,
  getErrorType,
  getUserFriendlyMessage,
} from '@/components/jovie/utils';

describe('extractErrorMetadata', () => {
  it('parses metadata from JSON error message', () => {
    const err = new Error(
      JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: 42,
        errorCode: 'RATE_LIMITED',
        requestId: 'req_abc123',
      })
    );

    expect(extractErrorMetadata(err)).toEqual({
      retryAfter: 42,
      errorCode: 'RATE_LIMITED',
      requestId: 'req_abc123',
    });
  });

  it('uses structured fields when available', () => {
    const err = Object.assign(new Error('Server failed'), {
      retryAfter: 12,
      code: 'CHAT_STREAM_FAILED',
      requestId: 'req_structured',
    });

    expect(extractErrorMetadata(err)).toEqual({
      retryAfter: 12,
      errorCode: 'CHAT_STREAM_FAILED',
      requestId: 'req_structured',
    });
  });

  it('clamps negative retryAfter to minimum of 1', () => {
    const err = new Error(JSON.stringify({ retryAfter: -10 }));
    expect(extractErrorMetadata(err)).toEqual({ retryAfter: 1 });
  });

  it('clamps excessive retryAfter to maximum of 3600', () => {
    const err = new Error(JSON.stringify({ retryAfter: 99999 }));
    expect(extractErrorMetadata(err)).toEqual({ retryAfter: 3600 });
  });
});

describe('chat error classification', () => {
  it('detects rate limits from status code', () => {
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    expect(getErrorType(err)).toBe('rate_limit');
  });

  it('builds polished rate limit copy with retry time', () => {
    expect(getUserFriendlyMessage('rate_limit', 19)).toBe(
      'Too many requests. Please wait 19 seconds.'
    );
  });
});
