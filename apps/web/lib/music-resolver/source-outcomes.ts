import type { ResolutionSourceError } from './in-house-contracts';

/** Project only structured provider metadata; never classify from private text. */
export function sourceFailure(
  source: ResolutionSourceError['source'],
  error: unknown
): ResolutionSourceError {
  const fields =
    error && typeof error === 'object'
      ? (error as Record<string, unknown>)
      : {};
  const codes = [fields.code, fields.errorCode];
  const status = fields.statusCode ?? fields.status;
  let code: ResolutionSourceError['code'] = 'UPSTREAM_FAILURE';
  let retryable =
    typeof fields.retryable === 'boolean'
      ? fields.retryable
      : !(typeof status === 'number' && status >= 400 && status < 500);
  if (
    status === 401 ||
    status === 403 ||
    codes.includes('UNAUTHORIZED') ||
    codes.includes('SPOTIFY_NOT_CONNECTED') ||
    fields.name === 'SpotifyAuthError'
  ) {
    code = 'UNAUTHORIZED';
    retryable = false;
  } else if (
    status === 429 ||
    codes.includes('RATE_LIMITED') ||
    codes.includes('SPOTIFY_RATE_LIMITED')
  ) {
    code = 'RATE_LIMITED';
    retryable = true;
  } else if (codes.includes('TIMEOUT') || fields.name === 'TimeoutError') {
    code = 'TIMEOUT';
    retryable = true;
  } else if (codes.includes('INVALID_RESPONSE')) {
    code = 'INVALID_RESPONSE';
    retryable = false;
  } else if (codes.includes('UNSUPPORTED')) {
    code = 'UNSUPPORTED';
    retryable = false;
  }
  const delay = fields.retryAfter;
  return {
    source,
    code,
    retryable,
    ...(code === 'RATE_LIMITED' &&
    typeof delay === 'number' &&
    Number.isFinite(delay) &&
    delay >= 0 &&
    delay <= Number.MAX_SAFE_INTEGER
      ? { retryAfterSeconds: delay }
      : {}),
  };
}
