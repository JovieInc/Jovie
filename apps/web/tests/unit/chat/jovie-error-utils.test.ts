import { describe, expect, it } from 'vitest';

import {
  extractErrorMetadata,
  getErrorType,
  getPreferredErrorMessage,
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

  it('extracts metadata from prefixed JSON error messages', () => {
    const err = new Error(
      'Error: {"error":"Rate limit exceeded","message":"You have reached your daily AI message limit. Upgrade to Pro for 100 messages per day.","errorCode":"RATE_LIMITED","retryAfter":3600,"requestId":"req_rate_limit"}'
    );

    expect(extractErrorMetadata(err)).toEqual({
      retryAfter: 3600,
      errorCode: 'RATE_LIMITED',
      requestId: 'req_rate_limit',
      message:
        'You have reached your daily AI message limit. Upgrade to Pro for 100 messages per day.',
    });
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

describe('getPreferredErrorMessage', () => {
  it('returns polished fallback for JSON-like transport errors', () => {
    const error = new Error(
      'Error: {"error":"Rate limit exceeded","errorCode":"RATE_LIMITED","retryAfter":3600}'
    );

    expect(
      getPreferredErrorMessage(error, 'rate_limit', {
        retryAfter: 3600,
        errorCode: 'RATE_LIMITED',
      })
    ).toBe('Too many requests. Please wait 3600 seconds.');
  });

  it('preserves plain-text server messages', () => {
    const error = new Error('Service is temporarily unavailable.');

    expect(getPreferredErrorMessage(error, 'server', {})).toBe(
      'Service is temporarily unavailable.'
    );
  });
});
