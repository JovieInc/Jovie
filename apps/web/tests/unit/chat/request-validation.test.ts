import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  MAX_CHAT_BODY_SIZE,
  MAX_PARTS_PER_MESSAGE,
  parseChatRequestBody,
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
