/**
 * Locked empty-chat greeting rotate set (JOV-5319).
 * Exact three strings. Do not add a fourth. Do not ship "What's next?".
 */

export const CHAT_EMPTY_ROTATE_GREETINGS = [
  "Let's get it",
  'Ready to start?',
  'Ready when you are',
] as const;

export type ChatEmptyRotateGreeting =
  (typeof CHAT_EMPTY_ROTATE_GREETINGS)[number];

/** Taste still frame. Rotation happens in product, not on the still. */
export const CHAT_EMPTY_STILL_GREETING = CHAT_EMPTY_ROTATE_GREETINGS[0];

export const CHAT_EMPTY_GREETING_STORAGE_KEY =
  'jovie.chat-empty-rotate-greeting-index';

export function greetingAtIndex(index: number): ChatEmptyRotateGreeting {
  const count = CHAT_EMPTY_ROTATE_GREETINGS.length;
  const safe = ((index % count) + count) % count;
  return CHAT_EMPTY_ROTATE_GREETINGS[safe];
}

function readSessionStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Returns the next locked greeting and advances the rotate index.
 * Falls back to the still ("Let's get it") when storage is unavailable.
 */
export function takeNextEmptyChatGreeting(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = readSessionStorage()
): ChatEmptyRotateGreeting {
  if (!storage) return CHAT_EMPTY_STILL_GREETING;
  try {
    const raw = storage.getItem(CHAT_EMPTY_GREETING_STORAGE_KEY);
    const parsed = raw == null ? 0 : Number.parseInt(raw, 10);
    const index = Number.isFinite(parsed) ? parsed : 0;
    const greeting = greetingAtIndex(index);
    storage.setItem(CHAT_EMPTY_GREETING_STORAGE_KEY, String(index + 1));
    return greeting;
  } catch {
    return CHAT_EMPTY_STILL_GREETING;
  }
}
