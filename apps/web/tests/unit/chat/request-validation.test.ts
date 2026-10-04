import type { UIMessage } from 'ai';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  MAX_CHAT_BODY_SIZE,
  MAX_MESSAGES_PER_REQUEST,
  MAX_PARTS_PER_MESSAGE,
  MAX_TOTAL_PARTS_SERIALIZED_BYTES,
  parseChatRequestBody,
  trimMessagesForChatRequest,
  validateMessagesArray,
} from '@/lib/chat/request-validation';

function chatRequest(body: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('parseChatRequestBody', () => {
  it('rejects oversized bodies before JSON parse with 413', async () => {
    const request = chatRequest(
      {
        messages: [
          {
            id: 'm1',
            role: 'user',
            parts: [{ type: 'text', text: 'hello' }],
          },
        ],
        profileId: '550e8400-e29b-41d4-a716-446655440000',
      },
      {
        'content-length': String(MAX_CHAT_BODY_SIZE + 1),
      }
    );

    const result = await parseChatRequestBody(request, {
      corsHeaders: {},
      requestId: 'req-413',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(413);
  });

  it('rejects messages with too many parts', async () => {
    const parts = Array.from({ length: MAX_PARTS_PER_MESSAGE + 1 }, (_, i) => ({
      type: 'text',
      text: `part-${i}`,
    }));

    const result = await parseChatRequestBody(
      chatRequest({
        messages: [{ id: 'm1', role: 'user', parts }],
        profileId: '550e8400-e29b-41d4-a716-446655440000',
      }),
      { corsHeaders: {}, requestId: 'req-parts' }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    const payload = await result.response.json();
    expect(payload.error).toContain('Too many message parts');
  });
});

describe('trimMessagesForChatRequest', () => {
  const staticBody = {
    profileId: '550e8400-e29b-41d4-a716-446655440000',
    conversationId: '660e8400-e29b-41d4-a716-446655440001',
  };

  function userMessage(id: string, text: string): UIMessage {
    return {
      id,
      role: 'user',
      parts: [{ type: 'text', text }],
    };
  }

  it('keeps empty requests empty without manufacturing a prompt', () => {
    expect(trimMessagesForChatRequest([], staticBody)).toEqual([]);
    expect(
      trimMessagesForChatRequest(
        [{ id: 'reply', role: 'assistant', parts: [] }],
        { ...staticBody, chatMode: 'ov' }
      )
    ).toEqual([]);
  });

  it('keeps all messages when the body is within the limit', () => {
    const messages = [userMessage('m1', 'hello'), userMessage('m2', 'world')];
    expect(trimMessagesForChatRequest(messages, staticBody)).toEqual(messages);
  });

  it('sends only the latest operator prompt when loaded history exceeds server limits', async () => {
    const newest = userMessage('newest', 'Why are my tasks still in triage?');
    const history: UIMessage[] = Array.from({ length: 40 }, (_, index) => ({
      id: `history-${index}`,
      role: 'assistant',
      parts: [{ type: 'text', text: 'x'.repeat(4_000) }],
    }));
    const body = { ...staticBody, chatMode: 'ov' };
    const trimmed = trimMessagesForChatRequest([...history, newest], body);

    expect(trimmed.map(message => message.id)).toEqual(['newest']);
    expect(trimmed[0]).toBe(newest);
    expect(
      (
        await parseChatRequestBody(
          chatRequest({ ...body, messages: trimmed }),
          {
            corsHeaders: {},
            requestId: 'operator-history',
          }
        )
      ).ok
    ).toBe(true);
  });

  it('selects the latest operator user prompt even after a partial assistant reply', () => {
    const newest = userMessage('newest', 'Try this request');
    const messages: UIMessage[] = [
      userMessage('older', 'Earlier request'),
      newest,
      { id: 'partial', role: 'assistant', parts: [] },
    ];

    expect(
      trimMessagesForChatRequest(messages, { ...staticBody, chatMode: 'ov' })
    ).toEqual([newest]);
    expect(messages).toHaveLength(3);
  });

  it('drops creator history to fit the combined UTF-8 parts budget below the body limit', async () => {
    const history: UIMessage[] = Array.from({ length: 40 }, (_, index) => ({
      id: `history-${index}`,
      role: 'assistant',
      parts: [{ type: 'text', text: 'é'.repeat(2_000) }],
    }));
    const newest = userMessage('newest', 'Continue');
    const messages = [...history, newest];
    expect(
      new TextEncoder().encode(JSON.stringify({ ...staticBody, messages }))
        .byteLength
    ).toBeLessThan(MAX_CHAT_BODY_SIZE);
    expect(validateMessagesArray(messages)).toBe(
      'Total message parts payload too large'
    );

    const trimmed = trimMessagesForChatRequest(messages, staticBody);

    expect(trimmed.length).toBeLessThan(messages.length);
    expect(trimmed.at(-1)).toBe(newest);
    expect(validateMessagesArray(trimmed)).toBeNull();
    expect(
      trimmed.reduce(
        (bytes, message) =>
          bytes +
          new TextEncoder().encode(JSON.stringify(message.parts)).byteLength,
        0
      )
    ).toBeLessThanOrEqual(MAX_TOTAL_PARTS_SERIALIZED_BYTES);
    expect(
      (
        await parseChatRequestBody(
          chatRequest({ ...staticBody, messages: trimmed }),
          { corsHeaders: {}, requestId: 'creator-history' }
        )
      ).ok
    ).toBe(true);
  });

  it('drops through invalid historical parts while retaining the valid recent suffix', () => {
    const newest = userMessage('newest', 'Continue');
    const recent = userMessage('recent', 'Recent context');
    const history: UIMessage = {
      id: 'too-many-parts',
      role: 'assistant',
      parts: Array.from({ length: MAX_PARTS_PER_MESSAGE + 1 }, () => ({
        type: 'text',
        text: 'Part',
      })),
    };

    const trimmed = trimMessagesForChatRequest(
      [userMessage('older', 'Old context'), history, recent, newest],
      staticBody
    );

    expect(trimmed.map(message => message.id)).toEqual(['recent', 'newest']);
    expect(validateMessagesArray(trimmed)).toBeNull();
    expect(trimmed.at(-1)).toBe(newest);
  });

  it('keeps at most the allowed number of creator messages', () => {
    const messages = Array.from(
      { length: MAX_MESSAGES_PER_REQUEST + 2 },
      (_, index) => userMessage(`m${index}`, 'Context')
    );
    const trimmed = trimMessagesForChatRequest(messages, staticBody);

    expect(trimmed).toEqual(messages.slice(2));
    expect(validateMessagesArray(trimmed)).toBeNull();
  });

  it('preserves an invalid newest message for server rejection without truncating user content', () => {
    const newest = userMessage('newest', 'x'.repeat(4_001));
    const trimmed = trimMessagesForChatRequest(
      [userMessage('older', 'Context'), newest],
      staticBody
    );

    expect(trimmed.at(-1)).toBe(newest);
    expect(validateMessagesArray(trimmed)).toContain('Message too long');
  });

  it('drops oldest messages until the complete serialized body fits', () => {
    const messages = Array.from({ length: 40 }, (_, index) =>
      userMessage(`m${index}`, 'x'.repeat(2_000))
    );
    const body = { ...staticBody, artistContext: { bio: 'x'.repeat(200_000) } };
    expect(validateMessagesArray(messages)).toBeNull();
    expect(
      new TextEncoder().encode(JSON.stringify({ ...body, messages })).byteLength
    ).toBeGreaterThan(MAX_CHAT_BODY_SIZE);

    const trimmed = trimMessagesForChatRequest(messages, body);
    const serialized = JSON.stringify({
      ...body,
      messages: trimmed,
    });

    expect(trimmed.length).toBeGreaterThan(0);
    expect(trimmed.length).toBeLessThan(messages.length);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      MAX_CHAT_BODY_SIZE
    );
    expect(trimmed.at(-1)?.id).toBe('m39');
    expect(validateMessagesArray(trimmed)).toBeNull();
  });

  it('preserves blob URL file parts when the body is within the limit', () => {
    const blobUrl =
      'https://example.blob.vercel-storage.com/chat-image-abc123.jpg';
    const messages: UIMessage[] = [
      {
        id: 'm1',
        role: 'user',
        parts: [
          { type: 'text', text: 'Here is the cover art' },
          {
            type: 'file',
            mediaType: 'image/jpeg',
            url: blobUrl,
          },
        ],
      },
    ];

    const trimmed = trimMessagesForChatRequest(messages, staticBody);
    expect(trimmed).toEqual(messages);

    const serialized = JSON.stringify({
      ...staticBody,
      messages: trimmed,
    });

    expect(serialized.includes(blobUrl)).toBe(true);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(
      MAX_CHAT_BODY_SIZE
    );
  });
});

describe('validateMessagesArray', () => {
  it('accepts a valid UIMessage array', () => {
    expect(
      validateMessagesArray([
        {
          id: 'm1',
          role: 'user',
          parts: [{ type: 'text', text: 'hello' }],
        },
      ])
    ).toBeNull();
  });
});
