import { describe, expect, it } from 'vitest';
import {
  getSessionErrorResponse,
  isSessionError,
} from '@/app/api/chat/session-error-response';

const UNAUTHORIZED_MESSAGES = [
  'Unauthorized',
  'Authentication required',
  'User not found',
];

describe('session error response helpers', () => {
  it.each(
    UNAUTHORIZED_MESSAGES
  )('maps "%s" to a 401 response', async message => {
    const response = getSessionErrorResponse(new TypeError(message), {
      'Cache-Control': 'no-store',
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({
      error: 'Unauthorized',
    });
  });

  it.each(
    UNAUTHORIZED_MESSAGES
  )('isSessionError returns true for "%s"', message => {
    expect(isSessionError(new TypeError(message))).toBe(true);
  });

  it('maps profile missing errors to 404', async () => {
    const response = getSessionErrorResponse(
      new TypeError('Profile not found'),
      {
        'Cache-Control': 'no-store',
      }
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(404);
    await expect(response?.json()).resolves.toEqual({
      error: 'Profile not found',
    });
  });

  it('isSessionError returns true for Profile not found', () => {
    expect(isSessionError(new TypeError('Profile not found'))).toBe(true);
  });

  it('returns null for non-session errors', () => {
    expect(getSessionErrorResponse(new Error('boom'), {})).toBeNull();
    expect(isSessionError(new Error('boom'))).toBe(false);
  });

  it('returns null for non-TypeError instances', () => {
    expect(getSessionErrorResponse(new Error('Unauthorized'), {})).toBeNull();
    expect(isSessionError(new Error('Unauthorized'))).toBe(false);
  });
});
