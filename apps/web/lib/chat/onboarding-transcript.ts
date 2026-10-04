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
  // Dropping an empty row (an assistant turn that was only a tool call) can
  // leave two same-role turns side by side. Fold them together so the model
  // always sees alternating roles.
  const prior: UIMessage[] = [];
  for (const message of persisted) {
    if (message.clientMessageId === latestClientMessageId) continue;
    const text = message.content.trim();
    if (!text) continue;
    const previous = prior.at(-1);
    if (previous?.role === message.role) {
      prior[prior.length - 1] = {
        ...previous,
        parts: [{ type: 'text', text: `${textOf(previous)}\n\n${text}` }],
      };
      continue;
    }
    prior.push({
      id: message.id,
      role: message.role,
      parts: [{ type: 'text', text: message.content }],
    });
  }
  if (!latestClient) return prior;

  const previous = prior.at(-1);
  if (previous?.role === 'user') {
    // Keep the client's message (id, metadata, widget parts) and lead it with
    // the unanswered earlier text.
    return [
      ...prior.slice(0, -1),
      {
        ...latestClient,
        parts: [
          { type: 'text', text: textOf(previous) },
          ...latestClient.parts,
        ],
      },
    ];
  }
  return [...prior, latestClient];
}

function textOf(message: UIMessage): string {
  return message.parts
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('');
}
