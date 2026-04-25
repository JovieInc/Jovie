/**
 * Regression: deterministic intent responses must stream as a UIMessage SSE
 * stream, not plain JSON. Returning JSON made the AI SDK `useChat` client
 * silently drop the assistant reply — user saw their message go out and no
 * confirmation ever rendered. Found by /qa on 2026-04-22.
 * Report: .gstack/qa-reports/qa-report-localhost-2026-04-22.md
 */

import { createUIMessageStream, createUIMessageStreamResponse } from 'ai';
import { describe, expect, it } from 'vitest';

function buildIntentReplyResponse(replyText: string): Response {
  const textId = 'txt-fixed-id';
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'start' });
      writer.write({ type: 'start-step' });
      writer.write({ type: 'text-start', id: textId });
      writer.write({ type: 'text-delta', id: textId, delta: replyText });
      writer.write({ type: 'text-end', id: textId });
      writer.write({ type: 'finish-step' });
      writer.write({ type: 'finish' });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { 'x-intent-routed': 'true' },
  });
}

describe('deterministic intent response is a UIMessage SSE stream', () => {
  it('returns text/event-stream content-type', async () => {
    const res = buildIntentReplyResponse('Done! Your bio has been updated.');
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('x-intent-routed')).toBe('true');
  });

  it('emits text-delta chunk containing the reply text', async () => {
    const res = buildIntentReplyResponse('Done! Your bio has been updated.');
    const body = await res.text();
    expect(body).toContain('"type":"text-start"');
    expect(body).toContain('"type":"text-delta"');
    expect(body).toContain('"delta":"Done! Your bio has been updated."');
    expect(body).toContain('"type":"text-end"');
    expect(body).toContain('"type":"finish"');
    expect(body.trim().endsWith('data: [DONE]')).toBe(true);
  });

  it('is not parseable as plain JSON (proves we are streaming, not returning a JSON body)', async () => {
    const res = buildIntentReplyResponse('hello');
    const body = await res.text();
    expect(() => JSON.parse(body)).toThrow();
  });
});
