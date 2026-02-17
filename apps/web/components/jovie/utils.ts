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

interface ErrorMetadata {
  retryAfter?: number;
  errorCode?: string;
  requestId?: string;
}

/**
 * Extracts metadata fields from a record-like source into the metadata object.
 * Overwrites existing fields if the source has valid values.
 */
function applyMetadataFields(
  metadata: ErrorMetadata,
  source: Record<string, unknown>
): void {
  if (
    typeof source.retryAfter === 'number' &&
    Number.isFinite(source.retryAfter)
  ) {
    metadata.retryAfter = Math.min(
      Math.max(Math.ceil(source.retryAfter), 1),
      3600
    );
  }

  if (typeof source.errorCode === 'string') {
    metadata.errorCode = source.errorCode;
  } else if (typeof source.code === 'string') {
    metadata.errorCode = source.code;
  }

  if (typeof source.requestId === 'string') {
    metadata.requestId = source.requestId;
  }
}

export function extractErrorMetadata(error: Error): ErrorMetadata {
  const metadata: ErrorMetadata = {};

  applyMetadataFields(metadata, error as unknown as Record<string, unknown>);

  const message = error.message.trim();
  if (message.startsWith('{') && message.endsWith('}')) {
    try {
      applyMetadataFields(
        metadata,
        JSON.parse(message) as Record<string, unknown>
      );
    } catch {
      // Ignore JSON parse failures - metadata may be on structured fields already.
    }
  }

  return metadata;
}
