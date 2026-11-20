import { vi } from 'vitest';
import {
  type CreditFailoverInput,
  createCreditFailoverModel,
} from '@/lib/ai/credit-failover';

export function fakeModel(label: string, behavior: 'ok' | Error) {
  return {
    provider: label,
    modelId: 'zai/glm-5.3-flash',
    doGenerate: vi.fn(async (_options: never) => {
      if (behavior !== 'ok') throw behavior;
      return { served: label };
    }),
    doStream: vi.fn(async (_options: never) => {
      if (behavior !== 'ok') throw behavior;
      return { stream: label };
    }),
  };
}

export type StreamPart = { type: string; [key: string]: unknown };

export function streamingModel(
  label: string,
  source: UnderlyingDefaultSource<StreamPart> | StreamPart[]
) {
  const underlying = Array.isArray(source)
    ? {
        start(controller: ReadableStreamDefaultController<StreamPart>) {
          source.forEach(part => controller.enqueue(part));
          controller.close();
        },
      }
    : source;
  return {
    ...fakeModel(label, 'ok'),
    doStream: vi.fn(async (_options: never) => ({
      stream: new ReadableStream(underlying, { highWaterMark: 0 }),
      response: { headers: { provider: label } },
    })),
  };
}

export function healthyStream(label = 'workers-ai') {
  return streamingModel(label, [
    { type: 'stream-start', warnings: [] },
    { type: 'text-delta', id: '1', delta: 'recovered' },
  ]);
}

type TestModel = Parameters<
  typeof createCreditFailoverModel
>[0]['primary']['model'];

export function failoverModel<MODEL extends TestModel>(
  primary: MODEL,
  secondary: TestModel | undefined = healthyStream(),
  options: Partial<
    Omit<CreditFailoverInput<MODEL>, 'primary' | 'secondary'>
  > = {}
) {
  return createCreditFailoverModel({
    label: 'jovie-chat',
    primary: { name: 'gateway', model: primary },
    secondary: { name: 'workers-ai', model: secondary },
    onFailover: () => undefined,
    ...options,
  });
}

export async function readParts(stream: ReadableStream<StreamPart>) {
  const parts: StreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const next = await reader.read();
    if (next.done) return parts;
    parts.push(next.value);
  }
}
