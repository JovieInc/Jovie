import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { extractLastUserImageUrl } from './message-text';

function userMessage(parts: unknown[]): UIMessage {
  return { id: 'm1', role: 'user', parts } as unknown as UIMessage;
}

describe('extractLastUserImageUrl', () => {
  it('returns the most recent user image file part url', () => {
    const messages = [
      userMessage([
        {
          type: 'file',
          mediaType: 'image/jpeg',
          url: 'https://blob.example.com/old.jpg',
        },
      ]),
      userMessage([
        { type: 'text', text: 'retouch this photo' },
        {
          type: 'file',
          mediaType: 'image/png',
          url: 'https://blob.example.com/new.png',
        },
      ]),
    ];

    expect(extractLastUserImageUrl(messages)).toBe(
      'https://blob.example.com/new.png'
    );
  });

  it('ignores non-image file parts and non-https urls', () => {
    const messages = [
      userMessage([
        {
          type: 'file',
          mediaType: 'audio/mpeg',
          url: 'https://blob.example.com/track.mp3',
        },
        {
          type: 'file',
          mediaType: 'image/png',
          url: 'data:image/png;base64,abc',
        },
      ]),
    ];

    expect(extractLastUserImageUrl(messages)).toBeNull();
  });

  it('returns null when there are no user messages', () => {
    const assistant = {
      id: 'a1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'hi' }],
    } as unknown as UIMessage;
    expect(extractLastUserImageUrl([assistant])).toBeNull();
  });
});
