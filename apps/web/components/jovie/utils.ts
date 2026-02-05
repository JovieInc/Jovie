import type { ChatErrorType } from './types';

/**
 * Extract text content from message parts
 */
export function getMessageText(
  parts: Array<{ type: string; text?: string }>
): string {
  return parts
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part.type === 'text' && typeof part.text === 'string'
    )
    .map(part => part.text)
    .join('');
}

/**
 * Determine the error type from an Error object
 */
export function getErrorType(error: Error): ChatErrorType {
  const msg = error.message.toLowerCase();
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('offline')
  ) {
    return 'network';
  }
  if (msg.includes('rate') || msg.includes('limit') || msg.includes('429')) {
    return 'rate_limit';
  }
  if (msg.includes('500') || msg.includes('server')) {
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
