/** Maximum allowed message length (characters) */
export const MAX_MESSAGE_LENGTH = 4000;

/** Maximum allowed messages per request */
export const MAX_MESSAGES_PER_REQUEST = 50;

/**
 * Extracts text content from a UIMessage's parts array.
 */
function extractUIMessageText(
  parts: Array<{ type: string; text?: string }>
): string {
  return parts
    .filter(
      (p): p is { type: 'text'; text: string } =>
        p.type === 'text' && typeof p.text === 'string'
    )
    .map(p => p.text)
    .join('');
}

/**
 * Validates a single UIMessage object.
 * AI SDK v6 UIMessages have { id, role, parts } instead of { role, content }.
 * Returns an error message string if invalid, null if valid.
 */
function validateMessage(message: unknown): string | null {
  if (typeof message !== 'object' || message === null || !('role' in message)) {
    return 'Invalid message format';
  }

  const msg = message as Record<string, unknown>;

  if (msg.role !== 'user' && msg.role !== 'assistant') {
    return 'Invalid message role';
  }

  // UIMessages must have a parts array
  if (!('parts' in msg) || !Array.isArray(msg.parts)) {
    return 'Invalid message format';
  }

  // Validate content length for user messages
  if (msg.role === 'user') {
    const contentStr = extractUIMessageText(
      msg.parts as Array<{ type: string; text?: string }>
    );
    if (contentStr.length > MAX_MESSAGE_LENGTH) {
      return `Message too long. Maximum is ${MAX_MESSAGE_LENGTH} characters`;
    }
  }

  return null;
}

/**
 * Validates the messages array (UIMessage format).
 * Returns an error message string if invalid, null if valid.
 */
export function validateMessagesArray(messages: unknown): string | null {
  if (!Array.isArray(messages)) {
    return 'Messages must be an array';
  }
  if (messages.length === 0) {
    return 'Messages array cannot be empty';
  }
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return `Too many messages. Maximum is ${MAX_MESSAGES_PER_REQUEST}`;
  }

  for (const message of messages) {
    const error = validateMessage(message);
    if (error) {
      return error;
    }
  }

  return null;
}
