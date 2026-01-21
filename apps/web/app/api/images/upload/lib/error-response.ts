/**
 * Error Response Helpers
 *
 * Utilities for building standardized error responses.
 */

import { NextResponse } from 'next/server';
import type { UploadErrorCode } from './constants';
import { NO_STORE_HEADERS } from './constants';
import type { PgErrorInfo, UploadErrorResponse } from './types';

export function errorResponse(
  error: string,
  code: UploadErrorCode,
  status: number,
  options?: { retryable?: boolean; retryAfter?: number; headers?: HeadersInit }
) {
  const body: UploadErrorResponse = { error, code };
  if (options?.retryable !== undefined) body.retryable = options.retryable;
  if (options?.retryAfter !== undefined) body.retryAfter = options.retryAfter;
  const headers = new Headers(options?.headers);
  headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control']);
  return NextResponse.json(body, { status, headers });
}

export const extractPgError = (error: unknown): PgErrorInfo | null => {
  if (typeof error !== 'object' || error === null) return null;
  const maybeError = error as Record<string, unknown>;
  return {
    code: typeof maybeError.code === 'string' ? maybeError.code : undefined,
    detail:
      typeof maybeError.detail === 'string' ? maybeError.detail : undefined,
    hint: typeof maybeError.hint === 'string' ? maybeError.hint : undefined,
    schema:
      typeof maybeError.schema === 'string' ? maybeError.schema : undefined,
    table: typeof maybeError.table === 'string' ? maybeError.table : undefined,
    constraint:
      typeof maybeError.constraint === 'string'
        ? maybeError.constraint
        : undefined,
  };
};
