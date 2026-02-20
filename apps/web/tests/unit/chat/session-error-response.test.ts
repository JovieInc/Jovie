import { describe, expect, it } from 'vitest';
import {
  getSessionErrorResponse,
  isSessionError,
} from '@/app/api/chat/session-error-response';

describe('session error response helpers', () => {
  it('maps known auth errors to 401', async () => {
    const response = getSessionErrorResponse(new TypeError('Unauthorized'), {
      'Cache-Control': 'no-store',
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' });
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

  it('returns null for non-session errors', () => {
    expect(getSessionErrorResponse(new Error('boom'), {})).toBeNull();
    expect(isSessionError(new Error('boom'))).toBe(false);
  });
});
