import { sanitizeConversationTitle } from './title';

const WORK_PROMPT = 'Help me with this work.';
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Derive a subject from known prompt envelopes without altering stored messages. */
export function conversationTitleSource(value: string | null | undefined): {
  readonly text: string | null;
  readonly deterministic: boolean;
} {
  const input = value?.trim() ?? '';
  if (input === WORK_PROMPT || input.startsWith(`${WORK_PROMPT}\n`)) {
    let subject: string | undefined;
    const envelope = input.slice(WORK_PROMPT.length).trim();
    if (envelope.length <= 16_384) {
      try {
        const parsed: unknown = JSON.parse(envelope);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const work = parsed as Record<string, unknown>;
          if (
            typeof work.workId === 'string' &&
            UUID.test(work.workId) &&
            typeof work.workTitle === 'string' &&
            !UUID.test(work.workTitle.trim())
          ) {
            subject = work.workTitle;
          }
        }
      } catch {
        // A partial machine envelope is not a usable conversation subject.
      }
    }
    return {
      text: sanitizeConversationTitle(subject) ?? 'Work discussion',
      deterministic: true,
    };
  }
  if (/^Prod health check:\s+reply (?:with\b|w\b)/i.test(input)) {
    return { text: 'Prod health check', deterministic: true };
  }
  return { text: sanitizeConversationTitle(input, 200), deterministic: false };
}
