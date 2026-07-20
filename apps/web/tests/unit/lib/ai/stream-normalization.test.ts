import { type LanguageModel, streamText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { toWhatwgReadableStream } from '@/lib/ai/stream-normalization';
import {
  createStaticTextLanguageModel,
  PROMPT_LEAK_CANARY,
} from '@/lib/chat/prompt-disclosure-guard';
import { wrapStreamTextResult } from '@/lib/eval/leak-guard';

vi.mock('@sentry/nextjs', () => ({
  addBreadcrumb: vi.fn(),
}));

function streamResultFor(text: string) {
  return streamText({
    model: createStaticTextLanguageModel(text) as unknown as LanguageModel,
    prompt: 'hi',
  });
}

describe('toWhatwgReadableStream', () => {
  it('passes a genuine WHATWG ReadableStream through untouched', () => {
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('a');
        controller.close();
      },
    });

    const normalized = toWhatwgReadableStream(source);

    expect(normalized).toBe(source);
    expect(typeof normalized.pipeThrough).toBe('function');
  });

  it('normalizes a bare AsyncIterable lacking pipeThrough into a genuine ReadableStream', async () => {
    async function* source() {
      yield 'alpha';
      yield 'beta';
    }
    const bare = source();
    expect(
      typeof (bare as unknown as { pipeThrough?: unknown }).pipeThrough
    ).toBe('undefined');

    const normalized = toWhatwgReadableStream(bare);

    expect(normalized).toBeInstanceOf(ReadableStream);
    expect(typeof normalized.pipeThrough).toBe('function');
    expect(typeof normalized.getReader).toBe('function');
    expect(typeof normalized.tee).toBe('function');

    const chunks: string[] = [];
    for await (const chunk of normalized) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['alpha', 'beta']);
  });

  it('supports pipeThrough-based consumption of a normalized generator', async () => {
    async function* source() {
      yield 1;
      yield 2;
    }

    const normalized = toWhatwgReadableStream(source());
    const doubled = normalized.pipeThrough(
      new TransformStream<number, number>({
        transform(chunk, controller) {
          controller.enqueue(chunk * 2);
        },
      })
    );

    const reader = doubled.getReader();
    const chunks: number[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    expect(chunks).toEqual([2, 4]);
  });

  it('propagates cancellation to the source iterator', async () => {
    let returned = false;
    async function* source() {
      try {
        yield 'a';
        yield 'b';
      } finally {
        returned = true;
      }
    }

    const normalized = toWhatwgReadableStream(source());
    const reader = normalized.getReader();
    expect((await reader.read()).value).toBe('a');
    await reader.cancel('consumer done');

    expect(returned).toBe(true);
  });
});

/**
 * Regression coverage for JOV-3694 (authed chat 500) and JOV-3693 (anonymous
 * onboarding 500): both routes call
 * `turn.streamResult.toUIMessageStreamResponse()` on a `streamText` result
 * wrapped by the output leak guard at the `@/lib/ai/sdk` boundary. The guard
 * must keep the SDK's `AsyncIterableStream` contract (ReadableStream +
 * AsyncIterable); a bare generator crashes the SDK's
 * `createUIMessageStreamResponse` with `TypeError: stream.pipeThrough is not
 * a function`.
 */
describe('wrapStreamTextResult stream contract (JOV-3694 / JOV-3693)', () => {
  it('keeps toUIMessageStream() output a genuine WHATWG ReadableStream', () => {
    const wrapped = wrapStreamTextResult(streamResultFor('Onward.'), {
      source: 'streamText',
    });

    const uiStream = wrapped.toUIMessageStream();

    expect(uiStream).toBeInstanceOf(ReadableStream);
    expect(typeof uiStream.pipeThrough).toBe('function');
  });

  it('toUIMessageStreamResponse() streams SSE instead of throwing pipeThrough TypeError', async () => {
    const wrapped = wrapStreamTextResult(
      streamResultFor('Pitch it four weeks out.'),
      { source: 'streamText' }
    );

    const response = wrapped.toUIMessageStreamResponse();

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('Pitch it four weeks out.');
  });

  it('still swaps leaked text deltas for the refusal', async () => {
    const wrapped = wrapStreamTextResult(
      streamResultFor(`leak: ${PROMPT_LEAK_CANARY}`),
      { source: 'streamText' }
    );

    const response = wrapped.toUIMessageStreamResponse();
    const body = await response.text();

    expect(body).toContain("can't share my internal setup");
    expect(body).not.toContain(PROMPT_LEAK_CANARY);
  });

  it('keeps textStream and fullStream genuinely stream-shaped and async-iterable', async () => {
    const wrapped = wrapStreamTextResult(streamResultFor('hello world'), {
      source: 'streamText',
    });

    expect(typeof wrapped.textStream.pipeThrough).toBe('function');
    expect(typeof wrapped.fullStream.pipeThrough).toBe('function');

    const deltas: string[] = [];
    for await (const delta of wrapped.textStream) {
      deltas.push(delta);
    }
    expect(deltas.join('')).toBe('hello world');
  });
});
