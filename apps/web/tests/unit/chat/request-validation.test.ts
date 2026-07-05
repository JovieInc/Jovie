import type { UIMessage } from 'ai';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  MAX_CHAT_BODY_SIZE,
  MAX_PARTS_PER_MESSAGE,
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

  it('keeps all messages when the body is within the limit', () => {
    const messages = [userMessage('m1', 'hello'), userMessage('m2', 'world')];
    expect(trimMessagesForChatRequest(messages, staticBody)).toEqual(messages);
  });

  it('drops oldest messages until the serialized body fits', () => {
    const largeText = 'x'.repeat(8_000);
    const messages = Array.from({ length: 40 }, (_, index) =>
      userMessage(`m${index}`, `${largeText}-${index}`)
    );

    const trimmed = trimMessagesForChatRequest(messages, staticBody);
    const serialized = JSON.stringify({
      ...staticBody,
      messages: trimmed,
    });

    expect(trimmed.length).toBeGreaterThan(0);
    expect(trimmed.length).toBeLessThan(messages.length);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(
      MAX_CHAT_BODY_SIZE
    );
    expect(trimmed.at(-1)?.id).toBe('m39');
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
