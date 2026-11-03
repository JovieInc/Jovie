import { streamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCreditFailoverModel,
  resetCreditBreakers,
} from '@/lib/ai/credit-failover';
import {
  CHAT_STREAM_STALLED_USER_MESSAGE,
  classifyChatStreamFailure,
} from '@/lib/ai/gateway-errors';
import {
  isStreamStallError,
  StreamStallError,
  withStreamStallGuard,
} from '@/lib/ai/stream-stall-guard';

type Part = { type: string; [key: string]: unknown };

const FAST = { firstChunkMs: 40, idleMs: 40 };

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** doStream that resolves immediately with a stream that never yields. */
function silentModel() {
  return new MockLanguageModelV4({
    provider: 'silent',
    modelId: 'zai/glm-5.3-flash',
    doStream: vi.fn(async () => ({
      stream: new ReadableStream<Part>({ start() {} }),
    })) as never,
  });
}

/** doStream whose promise never settles (provider accepted, never replied). */
function hangingModel() {
  return new MockLanguageModelV4({
    provider: 'hanging',
    modelId: 'zai/glm-5.3-flash',
    doStream: vi.fn(() => new Promise<never>(() => undefined)) as never,
  });
}

function textModel(label: string, text: string) {
  return new MockLanguageModelV4({
    provider: label,
    modelId: 'zai/glm-5.3-flash',
    doStream: vi.fn(async () => ({
      stream: new ReadableStream<Part>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: '1' });
          controller.enqueue({ type: 'text-delta', id: '1', delta: text });
          controller.enqueue({ type: 'text-end', id: '1' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          });
          controller.close();
        },
      }),
    })) as never,
  });
}

async function drain(stream: ReadableStream<Part>): Promise<Part[]> {
  const out: Part[] = [];
  const reader = stream.getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) return out;
    out.push(next.value);
  }
}

beforeEach(() => resetCreditBreakers());

describe('withStreamStallGuard', () => {
  it('rejects doStream with a first-chunk StreamStallError when the provider never answers', async () => {
    const guarded = withStreamStallGuard(hangingModel(), FAST);
    await expect(guarded.doStream({} as never)).rejects.toMatchObject({
      name: 'StreamStallError',
      phase: 'first-chunk',
    });
  });

  it('errors a stream that opens but never yields content', async () => {
    const guarded = withStreamStallGuard(silentModel(), FAST);
    const result = (await guarded.doStream({} as never)) as {
      stream: ReadableStream<Part>;
    };
    await expect(drain(result.stream)).rejects.toBeInstanceOf(StreamStallError);
  });

  it('does not count stream-start as progress', async () => {
    const model = new MockLanguageModelV4({
      doStream: vi.fn(async () => ({
        stream: new ReadableStream<Part>({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
          },
        }),
      })) as never,
    });
    const result = (await withStreamStallGuard(model, FAST).doStream(
      {} as never
    )) as { stream: ReadableStream<Part> };
    await expect(drain(result.stream)).rejects.toMatchObject({
      phase: 'first-chunk',
    });
  });

  it('errors with an idle stall when a started stream goes silent', async () => {
    const model = new MockLanguageModelV4({
      doStream: vi.fn(async () => ({
        stream: new ReadableStream<Part>({
          start(controller) {
            controller.enqueue({ type: 'text-delta', id: '1', delta: 'Hi' });
          },
        }),
      })) as never,
    });
    const result = (await withStreamStallGuard(model, FAST).doStream(
      {} as never
    )) as { stream: ReadableStream<Part> };
    await expect(drain(result.stream)).rejects.toMatchObject({
      phase: 'idle',
    });
  });

  it('passes a healthy stream through untouched', async () => {
    const result = (await withStreamStallGuard(
      textModel('ok', 'hello'),
      FAST
    ).doStream({} as never)) as { stream: ReadableStream<Part> };
    const parts = await drain(result.stream);
    expect(parts.map(part => part.type)).toEqual([
      'stream-start',
      'text-start',
      'text-delta',
      'text-end',
      'finish',
    ]);
  });

  it('keeps caller aborts distinct from stalls', async () => {
    const controller = new AbortController();
    const guarded = withStreamStallGuard(hangingModel(), {
      firstChunkMs: 5_000,
      idleMs: 5_000,
    });
    const pending = guarded.doStream({
      abortSignal: controller.signal,
    } as never);
    controller.abort(new Error('client left'));
    // The hanging model never settles, so the guard's own race must not mask
    // the abort as a stall; the stall timer is the only thing that settles it.
    const settled = await Promise.race([
      pending.then(
        () => 'resolved',
        () => 'rejected'
      ),
      new Promise(resolve => setTimeout(() => resolve('pending'), 100)),
    ]);
    expect(settled).toBe('pending');
  });
});

describe('stall failover and turn termination', () => {
  it('replays a first-chunk stall on the secondary provider', async () => {
    const primary = withStreamStallGuard(hangingModel(), FAST);
    const secondary = withStreamStallGuard(textModel('workers', 'ok'), FAST);
    const served: { provider?: 'gateway' | 'workers-ai' } = {};
    const events: unknown[] = [];
    const model = createCreditFailoverModel({
      label: 'test',
      primary: { name: 'gateway', model: primary },
      secondary: { name: 'workers-ai', model: secondary },
      served,
      onFailover: event => events.push(event),
    });
    const result = await streamText({ model, prompt: 'hi' });
    expect(await result.text).toBe('ok');
    expect(served.provider).toBe('workers-ai');
    expect(events).toMatchObject([{ reason: 'error', from: 'gateway' }]);
  });

  it('ends a turn within the bound when every provider stalls (never streams forever)', async () => {
    const model = createCreditFailoverModel({
      label: 'test',
      primary: {
        name: 'gateway',
        model: withStreamStallGuard(hangingModel(), FAST),
      },
      secondary: {
        name: 'workers-ai',
        model: withStreamStallGuard(silentModel(), FAST),
      },
    });
    const errors: unknown[] = [];
    const started = Date.now();
    const result = streamText({
      model,
      prompt: 'What should I do this week to get more listeners?',
      maxRetries: 0,
    });
    await result.consumeStream({ onError: error => errors.push(error) });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(errors).toHaveLength(1);
    expect(isStreamStallError(errors[0])).toBe(true);
  });

  it('classifies a stall as a failed_timeout turn with an honest retry message', () => {
    const failure = classifyChatStreamFailure(
      new StreamStallError('first-chunk', 15_000)
    );
    expect(failure.terminalStatus).toBe('failed_timeout');
    expect(failure.errorCode).toBe('CHAT_STREAM_STALLED');
    expect(failure.userMessage).toBe(CHAT_STREAM_STALLED_USER_MESSAGE);
    expect(failure.userMessage).toMatch(/retry/i);
  });
});
