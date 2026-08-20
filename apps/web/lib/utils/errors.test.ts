import { describe, expect, it } from 'vitest';

import {
  errorJsonReplacer,
  errorToString,
  isRedisQuotaFailure,
  unwrapCapturedContext,
  unwrapCapturedError,
} from './errors';

function upstashError(message: string): Error {
  const error = new Error(message);
  error.name = 'UpstashError';
  return error;
}

describe('unwrapCapturedError', () => {
  it('returns Error instances unchanged', () => {
    const error = upstashError('ERR max requests limit exceeded');
    expect(unwrapCapturedError(error)).toBe(error);
  });

  it('unwraps { error } wrappers used as captureError second args', () => {
    const inner = upstashError('ERR max requests limit exceeded');
    expect(unwrapCapturedError({ error: inner })).toBe(inner);
  });

  it('keeps leftover wrapper fields as capture context', () => {
    const inner = upstashError('ERR max requests limit exceeded');
    expect(
      unwrapCapturedContext(
        { clerkUserId: 'user_1', error: inner },
        { route: '/app' }
      )
    ).toEqual({ clerkUserId: 'user_1', route: '/app' });
  });
});

describe('errorToString', () => {
  it('preserves UpstashError name and message inside JSON wrappers', () => {
    expect(
      JSON.parse(
        errorToString({
          error: upstashError('ERR max requests limit exceeded'),
        })
      )
    ).toEqual({
      error: {
        name: 'UpstashError',
        message: 'ERR max requests limit exceeded',
      },
    });
  });

  it('does not serialize Error instances as name-only objects', () => {
    expect(JSON.stringify(upstashError('quota'), errorJsonReplacer)).toBe(
      JSON.stringify({ name: 'UpstashError', message: 'quota' })
    );
  });
});

describe('isRedisQuotaFailure', () => {
  it('detects quota exhaustion on wrapped UpstashError objects', () => {
    expect(
      isRedisQuotaFailure({
        error: upstashError(
          'ERR max requests limit exceeded. Limit: 500000, Usage: 500099'
        ),
      })
    ).toBe(true);
  });

  it('does not treat unrelated Upstash errors as quota exhaustion', () => {
    expect(
      isRedisQuotaFailure({
        error: upstashError('WRONGPASS invalid or missing auth token'),
      })
    ).toBe(false);
  });
});
