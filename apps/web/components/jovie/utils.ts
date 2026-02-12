import type { ChatErrorType, MessagePart } from './types';

interface ParsedChatErrorPayload {
  readonly message?: string;
  readonly retryAfter?: number;
  readonly errorCode?: string;
}

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
 * Parse structured payloads from AI SDK errors when available.
 * The API sometimes returns JSON in error.message for non-2xx responses.
 */
export function parseChatErrorPayload(error: Error): ParsedChatErrorPayload {
  try {
    const errorData = JSON.parse(error.message) as Record<string, unknown>;
    return {
      message:
        typeof errorData.message === 'string' ? errorData.message : undefined,
      retryAfter:
        typeof errorData.retryAfter === 'number'
          ? errorData.retryAfter
          : undefined,
      errorCode:
        typeof errorData.code === 'string'
          ? errorData.code
          : typeof errorData.errorCode === 'string'
            ? errorData.errorCode
            : undefined,
    };
  } catch {
    const codeMatch = error.message.match(/\[([A-Z_]+)\]/);
    return {
      errorCode: codeMatch?.[1],
    };
  }
}

/**
 * Determines if a rate-limit failure represents plan quota exhaustion
 * ("out of messages") rather than short burst throttling.
 */
export function shouldShowUpgradeMessage(
  type: ChatErrorType,
  rateLimitReason?: string
): boolean {
  if (type !== 'rate_limit') return false;
  if (!rateLimitReason) return false;

  const normalizedReason = rateLimitReason.toLowerCase();
  return (
    normalizedReason.includes('daily ai message limit') ||
    normalizedReason.includes('out of messages') ||
    normalizedReason.includes('daily quota') ||
    normalizedReason.includes('upgrade')
  );
}

/**
 * Assistant copy shown inline when a user runs out of messages.
 */
export function getUpgradePromptMessage(): string {
  return "You've hit your AI message limit for today. Upgrade to keep the conversation going: https://jovie.fm/pricing";
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
