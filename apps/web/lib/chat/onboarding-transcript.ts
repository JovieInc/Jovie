import type { UIMessage } from 'ai';

/** One persisted anonymous onboarding message, oldest first. */
export interface PersistedOnboardingMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly clientMessageId: string | null;
}

function countUserMessages(messages: readonly { role: string }[]): number {
  return messages.filter(message => message.role === 'user').length;
}

/**
 * The anonymous /start conversation is keyed by the session cookie and
 * persisted server-side, but the client only sends the history it still holds.
 * After a reload or a new tab the client sends just the newest message, and
 * the turn looked like a first turn: Jovie repeated its opener to someone it
 * had already greeted. When the server holds more of this conversation than
 * the client sent, resume from the server transcript (text only) and keep the
 * client's latest user message as sent, so its widget metadata still applies.
 */
export function resumeOnboardingTranscript(input: {
  readonly clientMessages: readonly UIMessage[];
  readonly persisted: readonly PersistedOnboardingMessage[];
  readonly latestClientMessageId: string;
}): UIMessage[] {
  const { clientMessages, persisted, latestClientMessageId } = input;
  if (countUserMessages(persisted) <= countUserMessages(clientMessages)) {
    return [...clientMessages];
  }

  const latestClient = [...clientMessages]
    .reverse()
    .find(message => message.role === 'user');
  const prior = persisted
    .filter(message => message.clientMessageId !== latestClientMessageId)
    .filter(message => message.content.trim().length > 0)
    .map(
      (message): UIMessage => ({
        id: message.id,
        role: message.role,
        parts: [{ type: 'text', text: message.content }],
      })
    );
  return latestClient ? [...prior, latestClient] : prior;
}
