import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { resumeOnboardingTranscript } from './onboarding-transcript';

function user(id: string, text: string, metadata?: unknown): UIMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text }],
    ...(metadata ? { metadata } : {}),
  } as UIMessage;
}

const OPENER = "Hey, I'm Jovie. What are you working on?";

describe('resumeOnboardingTranscript', () => {
  it('keeps the client history when it already holds the conversation', () => {
    const clientMessages = [user('c1', 'hi')];
    const result = resumeOnboardingTranscript({
      clientMessages,
      latestClientMessageId: 'c1',
      persisted: [
        { id: 'p1', role: 'user', content: 'hi', clientMessageId: 'c1' },
      ],
    });
    expect(result).toEqual(clientMessages);
  });

  it('resumes from the server transcript after a reload so the opener is not repeated', () => {
    const latest = user('c2', 'hi', { onboardingEvent: 'x' });
    const result = resumeOnboardingTranscript({
      clientMessages: [latest],
      latestClientMessageId: 'c2',
      persisted: [
        { id: 'p1', role: 'user', content: 'hi', clientMessageId: 'c1' },
        { id: 'p2', role: 'assistant', content: OPENER, clientMessageId: null },
        { id: 'p3', role: 'user', content: 'hi', clientMessageId: 'c2' },
      ],
    });

    expect(result.map(message => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(result[1]?.parts).toEqual([{ type: 'text', text: OPENER }]);
    // The newest message is the client's own, metadata intact.
    expect(result.at(-1)).toBe(latest);
    expect(result.filter(message => message.role === 'user')).toHaveLength(2);
  });

  it('drops empty persisted rows', () => {
    const result = resumeOnboardingTranscript({
      clientMessages: [user('c3', 'next')],
      latestClientMessageId: 'c3',
      persisted: [
        { id: 'p1', role: 'user', content: 'hi', clientMessageId: 'c1' },
        { id: 'p2', role: 'assistant', content: '  ', clientMessageId: null },
        { id: 'p3', role: 'user', content: 'yo', clientMessageId: 'c2' },
        { id: 'p4', role: 'user', content: 'next', clientMessageId: 'c3' },
      ],
    });
    expect(result.map(message => message.id)).toEqual(['p1', 'p3', 'c3']);
  });
});
