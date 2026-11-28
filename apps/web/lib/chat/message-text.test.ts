import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { extractLastUserImageUrl } from './message-text';
import { extractUIMessageText } from './request-validation';

const importedBioToolPart: UIMessage['parts'][number] = {
  type: 'dynamic-tool',
  toolName: 'importBio',
  toolCallId: 'bio-draft',
  state: 'output-available',
  input: {},
  output: { success: true },
};

describe('text boundaries in persisted replies', () => {
  it('separates text before and after a tool step', () => {
    expect(
      extractUIMessageText([
        { type: 'step-start' },
        { type: 'text', text: 'I will check the source.' },
        importedBioToolPart,
        { type: 'step-start' },
        { type: 'text', text: '' },
        { type: 'text', text: 'Your draft is ready to review.' },
      ])
    ).toBe('I will check the source.\n\nYour draft is ready to review.');
  });

  it('keeps adjacent streamed fragments intact', () => {
    expect(
      extractUIMessageText([
        { type: 'text', text: 'Your **pro' },
        { type: 'text', text: 'file** is ready.' },
      ])
    ).toBe('Your **profile** is ready.');
  });

  it.each([
    ['First paragraph.\n\n', 'Second paragraph.'],
    ['First paragraph.', '\n\nSecond paragraph.'],
    ['First paragraph.\n', '\nSecond paragraph.'],
  ])('preserves existing paragraph spacing', (before, after) => {
    expect(
      extractUIMessageText([
        { type: 'text', text: before },
        { type: 'step-start' },
        { type: 'text', text: after },
      ])
    ).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('does not add leading or trailing text for tool-only steps', () => {
    expect(
      extractUIMessageText([
        { type: 'step-start' },
        importedBioToolPart,
        { type: 'text', text: '    Indented code stays indented.' },
        { type: 'step-start' },
      ])
    ).toBe('    Indented code stays indented.');
    expect(extractUIMessageText([{ type: 'step-start' }])).toBe('');
  });
});

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
