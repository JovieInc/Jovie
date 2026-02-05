import type { ChatErrorType, MessagePart } from './types';

/**
 * Extract text content from message parts
 */
export function getMessageText(parts: readonly MessagePart[]): string {
  return parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map(part => part.text)
    .join('');
}

/**
 * Determine the error type from an Error object.
 * Prefers structured properties (status, code, name) before falling back to message matching.
 */
export function getErrorType(error: Error): ChatErrorType {
  // Check structured properties first (e.g. { status, code } from API errors)
  const errorObj = error as unknown as Record<string, unknown>;
  const status = errorObj.status as number | undefined;
  const code = errorObj.code as string | undefined;

  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return 'network';
  }

  if (status === 429 || code === 'RATE_LIMITED') {
    return 'rate_limit';
  }

  if (typeof status === 'number' && status >= 500) {
    return 'server';
  }

  // Fall back to message pattern matching with word boundaries
  const msg = error.message.toLowerCase();
  if (/\b(network|fetch|offline)\b/.test(msg)) {
    return 'network';
  }
  if (/\b(rate|limit|429)\b/.test(msg)) {
    return 'rate_limit';
  }
  if (/\b(500|5\d{2}|server)\b/.test(msg)) {
    return 'server';
  }
  return 'unknown';
}

/**
 * Get user-friendly error message based on error type
 */
export function getUserFriendlyMessage(
  type: ChatErrorType,
  retryAfter?: number
): string {
  switch (type) {
    case 'network':
      return 'Unable to connect. Please check your internet connection.';
    case 'rate_limit':
      return retryAfter
        ? `Too many requests. Please wait ${retryAfter} seconds.`
        : 'Too many requests. Please wait a moment.';
    case 'server':
      return 'We encountered a temporary issue. Please try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/**
 * Get next step message based on error type
 */
export function getNextStepMessage(type: ChatErrorType): string {
  switch (type) {
    case 'network':
      return 'Check your connection and try again';
    case 'rate_limit':
      return 'Wait a moment, then try again';
    case 'server':
      return 'Try again or contact support if this persists';
    default:
      return 'Try again or contact support';
  }
}
