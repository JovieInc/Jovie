import { createUIMessageStream, type UIMessageChunk } from 'ai';
import { describe, expect, it, vi } from 'vitest';

describe('AI SDK UI message stream cancellation', () => {
  it('cancels a merged model stream when the client disconnects', async () => {
    let cancelReason: unknown;
    const modelStream = new ReadableStream<UIMessageChunk>({
      pull() {
        return new Promise(() => undefined);
      },
      cancel(reason) {
        cancelReason = reason;
      },
    });
    const responseStream = createUIMessageStream({
      execute: ({ writer }) => writer.merge(modelStream),
    });

    await responseStream.cancel('client-disconnected');

    await vi.waitFor(() => {
      expect(cancelReason).toBe('client-disconnected');
    });
  });
});
