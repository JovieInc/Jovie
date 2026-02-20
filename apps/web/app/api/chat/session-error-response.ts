import { NextResponse } from 'next/server';

const UNAUTHORIZED_MESSAGES = new Set([
  'Unauthorized',
  'Authentication required',
  'User not found',
]);

/**
 * Checks whether the error matches a known session/auth failure pattern
 * without constructing a response object.
 */
function isKnownSessionErrorMessage(error: unknown): boolean {
  if (!(error instanceof TypeError)) {
    return false;
  }
  return (
    UNAUTHORIZED_MESSAGES.has(error.message) ||
    error.message === 'Profile not found'
  );
}

/**
 * Converts known auth/session failures into stable API responses.
 */
export function getSessionErrorResponse(
  error: unknown,
  headers: HeadersInit
): NextResponse | null {
  if (!(error instanceof TypeError)) {
    return null;
  }

  if (UNAUTHORIZED_MESSAGES.has(error.message)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers }
    );
  }

  if (error.message === 'Profile not found') {
    return NextResponse.json(
      { error: 'Profile not found' },
      { status: 404, headers }
    );
  }

  return null;
}

export function isSessionError(error: unknown): boolean {
  return isKnownSessionErrorMessage(error);
}
