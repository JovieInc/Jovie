/** A deliberate New Chat activation can target an already-mounted /app/chat. */
export const NEW_CHAT_REQUESTED_EVENT = 'jovie-chat-new-conversation';

export function requestNewChat(): void {
  globalThis.dispatchEvent(new Event(NEW_CHAT_REQUESTED_EVENT));
}
