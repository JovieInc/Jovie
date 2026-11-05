import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AiFailoverEvent,
  createCreditFailoverModel,
  creditBreakerOpen,
  isProviderCreditError,
  resetCreditBreakers,
} from '@/lib/ai/credit-failover';
import { withStreamStallGuard } from '@/lib/ai/stream-stall-guard';
import {
  failoverModel,
  fakeModel,
  healthyStream,
  readParts,
  type StreamPart,
  streamingModel,
} from './credit-failover.test-helpers';

/** What the Vercel AI Gateway returns when the team credit balance is spent. */
function gatewayCreditsExhausted(): Error {
  return Object.assign(
    new Error(
      'Insufficient funds. Your account needs a positive credit balance. Add credits at https://vercel.com/~/ai/credits'
    ),
    { name: 'GatewayInternalServerError', statusCode: 402 }
  );
}

/** What Workers AI returns when the account is out of allocation or credits. */
function workersAiOutOfCredits(): Error {
  return Object.assign(
    new Error(
      'AiError: you have used up your daily free allocation of 10,000 neurons'
    ),
    { name: 'AI_APICallError', statusCode: 429 }
  );
}

describe('isProviderCreditError', () => {
  it('recognizes Gateway insufficient funds and key budgets', () => {
    expect(isProviderCreditError(gatewayCreditsExhausted())).toBe(true);
    expect(
      isProviderCreditError(new Error('API key budget exceeded. limit: $1.00'))
    ).toBe(true);
  });

  it('recognizes Workers AI allocation errors and bare 402s, even nested', () => {
    expect(isProviderCreditError(workersAiOutOfCredits())).toBe(true);
    expect(
      isProviderCreditError(Object.assign(new Error('boom'), { status: 402 }))
    ).toBe(true);
    expect(
      isProviderCreditError(
        new Error('wrapped', { cause: workersAiOutOfCredits() })
      )
    ).toBe(true);
    expect(
      isProviderCreditError(
        JSON.stringify({ error: { message: 'payment required' } })
      )
    ).toBe(true);
  });

  it('does not treat ordinary failures as credit errors', () => {
    expect(isProviderCreditError(new Error('socket hang up'))).toBe(false);
    expect(isProviderCreditError(new Error('Invalid schema'))).toBe(false);
    expect(isProviderCreditError(undefined)).toBe(false);
  });
});

describe('createCreditFailoverModel', () => {
  beforeEach(() => resetCreditBreakers());

  it('fails over Gateway -> Workers AI when Gateway credits are exhausted', async () => {
    const gateway = fakeModel('gateway', gatewayCreditsExhausted());
    const workers = fakeModel('workers-ai', 'ok');
    const events: AiFailoverEvent[] = [];
    const served: { provider?: 'gateway' | 'workers-ai' } = {};
    const model = failoverModel(gateway, workers, {
      served,
      onFailover: event => events.push(event),
    });
    await expect(model.doGenerate({} as never)).resolves.toEqual({
      served: 'workers-ai',
    });
    expect(served.provider).toBe('workers-ai');
    expect(events).toEqual([
      {
        kind: 'ai-failover',
        label: 'jovie-chat',
        from: 'gateway',
        to: 'workers-ai',
        reason: 'credit',
      },
    ]);
    // The wrapper still looks like the primary model to the AI SDK.
    expect(model.modelId).toBe('zai/glm-5.3-flash');
  });

  it('fails over Workers AI -> Gateway when Cloudflare credits are exhausted', async () => {
    const workers = fakeModel('workers-ai', workersAiOutOfCredits());
    const gateway = fakeModel('gateway', 'ok');
    const model = createCreditFailoverModel({
      label: 'jovie-insight-generator',
      primary: { name: 'workers-ai', model: workers },
      secondary: { name: 'gateway', model: gateway },
      onFailover: () => undefined,
    });
    await expect(model.doGenerate({} as never)).resolves.toEqual({
      served: 'gateway',
    });
  });

  it('fails over streams that are rejected before the first chunk', async () => {
    const model = failoverModel(
      fakeModel('gateway', gatewayCreditsExhausted()),
      fakeModel('workers-ai', 'ok')
    );

    await expect(model.doStream({} as never)).resolves.toEqual({
      stream: 'workers-ai',
    });
  });

  it('opens a breaker so the next calls skip the dead provider', async () => {
    const gateway = fakeModel('gateway', gatewayCreditsExhausted());
    const workers = fakeModel('workers-ai', 'ok');
    const events: AiFailoverEvent[] = [];
    let clock = 1_000;
    const model = failoverModel(gateway, workers, {
      onFailover: event => events.push(event),
      now: () => clock,
    });
    await model.doGenerate({} as never);
    expect(creditBreakerOpen('gateway', clock)).toBe(true);
    await model.doGenerate({} as never);
    expect(gateway.doGenerate).toHaveBeenCalledTimes(1);
    expect(events.map(event => event.reason)).toEqual(['credit', 'breaker']);

    clock += 61_000;
    expect(creditBreakerOpen('gateway', clock)).toBe(false);
  });

  it('does not fail over on non-credit errors by default', async () => {
    const boom = new Error('invalid request body');
    const model = failoverModel(
      fakeModel('gateway', boom),
      fakeModel('workers-ai', 'ok')
    );

    await expect(model.doGenerate({} as never)).rejects.toBe(boom);
  });

  it('never fails over an aborted call', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const workers = fakeModel('workers-ai', 'ok');
    const model = failoverModel(fakeModel('gateway', aborted), workers);

    await expect(model.doGenerate({} as never)).rejects.toBe(aborted);
    expect(workers.doGenerate).not.toHaveBeenCalled();
  });

  it('surfaces the original error when the secondary is not configured', async () => {
    const dead = gatewayCreditsExhausted();
    const model = createCreditFailoverModel({
      label: 'x',
      primary: { name: 'gateway', model: fakeModel('gateway', dead) },
      secondary: { name: 'workers-ai', model: undefined },
    });
    await expect(model.doGenerate({} as never)).rejects.toBe(dead);
  });
});

describe('credit failover before stream output', () => {
  beforeEach(() => resetCreditBreakers());

  it.each(['rejection', 'error-part'] as const)(
    'recovers a credit %s after the stream opens before content',
    async failure => {
      const credit = gatewayCreditsExhausted();
      const primary = streamingModel('gateway', {
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: ['primary'] });
          controller.enqueue({ type: 'response-metadata', id: 'primary' });
        },
        pull(controller) {
          if (failure === 'rejection') controller.error(credit);
          else {
            controller.enqueue({ type: 'error', error: credit });
            controller.close();
          }
        },
      });
      const secondary = healthyStream();
      const events: AiFailoverEvent[] = [];
      const served: { provider?: 'gateway' | 'workers-ai' } = {};
      const model = failoverModel(primary, secondary, {
        served,
        onFailover: event => events.push(event),
      });
      const result = await model.doStream({} as never);
      const parts = await readParts(result.stream);
      expect(parts).toEqual([
        { type: 'stream-start', warnings: [] },
        { type: 'text-delta', id: '1', delta: 'recovered' },
      ]);
      expect(result.response.headers.provider).toBe('workers-ai');
      expect(secondary.doStream).toHaveBeenCalledTimes(1);
      expect(served.provider).toBe('workers-ai');
      expect(creditBreakerOpen('gateway')).toBe(true);
      expect(events).toMatchObject([{ reason: 'credit' }]);
    }
  );

  it('recovers a first-chunk stall after the stream opens', async () => {
    const primary = withStreamStallGuard(
      streamingModel('gateway', { start() {} }),
      { firstChunkMs: 20, idleMs: 20 }
    );
    const secondary = healthyStream();
    const model = failoverModel(primary, secondary);
    const result = await model.doStream({} as never);
    expect(await readParts(result.stream)).toContainEqual({
      type: 'text-delta',
      id: '1',
      delta: 'recovered',
    });
    expect(secondary.doStream).toHaveBeenCalledTimes(1);
    expect(creditBreakerOpen('gateway')).toBe(false);
  });

  it.each(['rejection', 'error-part'] as const)(
    'propagates the secondary %s without another replay',
    async failure => {
      const primary = streamingModel('gateway', {
        start(controller) {
          controller.enqueue({
            type: 'error',
            error: gatewayCreditsExhausted(),
          });
        },
      });
      const unavailable = new Error('Secondary provider unavailable');
      const secondary = streamingModel('workers-ai', [
        { type: 'error', error: unavailable },
      ]);
      if (failure === 'rejection')
        secondary.doStream.mockRejectedValue(unavailable);
      const onFailover = vi.fn();
      const model = failoverModel(primary, secondary, { onFailover });
      if (failure === 'rejection') {
        await expect(model.doStream({} as never)).rejects.toBe(unavailable);
      } else {
        const result = await model.doStream({} as never);
        expect(await readParts(result.stream)).toEqual([
          { type: 'error', error: unavailable },
        ]);
      }
      expect(primary.doStream).toHaveBeenCalledTimes(1);
      expect(secondary.doStream).toHaveBeenCalledTimes(1);
      expect(onFailover).toHaveBeenCalledTimes(1);
    }
  );

  it('cancels lookahead on caller abort without failing over', async () => {
    const cancel = vi.fn();
    const primary = streamingModel('gateway', {
      start(controller) {
        controller.enqueue({ type: 'stream-start' });
      },
      cancel,
    });
    const secondary = healthyStream();
    const model = failoverModel(primary, secondary, {
      shouldFailover: () => true,
    });
    const controller = new AbortController();
    const reason = gatewayCreditsExhausted();
    const pending = model.doStream({ abortSignal: controller.signal } as never);
    const rejected = expect(pending).rejects.toBe(reason);
    await Promise.resolve();
    controller.abort(reason);
    await rejected;
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason);
    expect(secondary.doStream).not.toHaveBeenCalled();
  });

  it('does not start either provider for an already aborted call', async () => {
    const primary = healthyStream('gateway');
    const secondary = healthyStream();
    const model = failoverModel(primary, secondary);
    const controller = new AbortController();
    controller.abort();
    await expect(
      model.doStream({ abortSignal: controller.signal } as never)
    ).rejects.toBe(controller.signal.reason);
    expect(primary.doStream).not.toHaveBeenCalled();
    expect(secondary.doStream).not.toHaveBeenCalled();
  });

  it('preserves backpressure and downstream cancellation after first output', async () => {
    const cancel = vi.fn();
    const pull = vi.fn(
      (controller: ReadableStreamDefaultController<StreamPart>) => {
        controller.enqueue({ type: 'text-delta', id: '1', delta: 'visible' });
      }
    );
    const primary = streamingModel('gateway', { pull, cancel });
    const secondary = healthyStream();
    const model = failoverModel(primary, secondary);
    const options = { abortSignal: new AbortController().signal };
    const result = await model.doStream(options as never);
    expect(primary.doStream).toHaveBeenCalledExactlyOnceWith(options);
    expect(pull).toHaveBeenCalledTimes(1);
    const reader = result.stream.getReader();
    expect((await reader.read()).value?.type).toBe('text-delta');
    await Promise.resolve();
    expect(pull).toHaveBeenCalledTimes(1);
    const reason = new Error('Consumer stopped');
    await reader.cancel(reason);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason);
    expect(secondary.doStream).not.toHaveBeenCalled();
  });

  it('cancels an opened stream when its caller aborts after lookahead', async () => {
    const cancel = vi.fn();
    const primary = streamingModel('gateway', {
      start(controller) {
        controller.enqueue({ type: 'text-delta', id: '1', delta: 'visible' });
      },
      cancel,
    });
    const secondary = healthyStream();
    const controller = new AbortController();
    const model = failoverModel(primary, secondary);
    const result = await model.doStream({
      abortSignal: controller.signal,
    } as never);
    controller.abort();
    expect(cancel).toHaveBeenCalledExactlyOnceWith(controller.signal.reason);
    await expect(readParts(result.stream)).rejects.toBe(
      controller.signal.reason
    );
    expect(secondary.doStream).not.toHaveBeenCalled();
  });

  it.each(['text-delta', 'tool-call', 'reasoning-delta'])(
    'never replays an error part after %s',
    async type => {
      const error = gatewayCreditsExhausted();
      const primary = streamingModel('gateway', [
        { type, id: '1', delta: 'committed' },
        { type: 'error', error },
      ]);
      const secondary = healthyStream();
      const model = failoverModel(primary, secondary);
      const result = await model.doStream({} as never);
      expect(await readParts(result.stream)).toEqual([
        { type, id: '1', delta: 'committed' },
        { type: 'error', error },
      ]);
      expect(secondary.doStream).not.toHaveBeenCalled();
      expect(creditBreakerOpen('gateway')).toBe(false);
    }
  );

  it('forwards a stream rejection after text without replay', async () => {
    const error = gatewayCreditsExhausted();
    const primary = streamingModel('gateway', {
      start(controller) {
        controller.enqueue({ type: 'text-delta', id: '1', delta: 'committed' });
      },
      pull(controller) {
        controller.error(error);
      },
    });
    const secondary = healthyStream();
    const model = failoverModel(primary, secondary);
    const result = await model.doStream({} as never);
    const reader = result.stream.getReader();
    expect((await reader.read()).value?.type).toBe('text-delta');
    await expect(reader.read()).rejects.toBe(error);
    expect(secondary.doStream).not.toHaveBeenCalled();
  });

  it('preserves the SDK channel for an ordinary pre-output error part', async () => {
    const error = new Error('Invalid schema');
    const cancel = vi.fn();
    const primary = streamingModel('gateway', {
      start(controller) {
        controller.enqueue({ type: 'error', error });
      },
      cancel,
    });
    const secondary = healthyStream();
    const model = failoverModel(primary, secondary);
    const result = await model.doStream({} as never);
    const reader = result.stream.getReader();
    expect((await reader.read()).value).toEqual({ type: 'error', error });
    await reader.cancel(error);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(error);
    expect(secondary.doStream).not.toHaveBeenCalled();
  });

  it('preserves leading metadata and closure for an empty healthy stream', async () => {
    const parts = [
      { type: 'stream-start' },
      { type: 'response-metadata', id: '1' },
    ];
    const primary = streamingModel('gateway', parts);
    const model = failoverModel(primary);
    const result = await model.doStream({} as never);
    expect(await readParts(result.stream)).toEqual(parts);
  });

  it('bounds leading metadata without replaying an invalid provider stream', async () => {
    const cancel = vi.fn();
    const pull = vi.fn(
      (controller: ReadableStreamDefaultController<StreamPart>) => {
        controller.enqueue({ type: 'response-metadata', id: 'flood' });
      }
    );
    const primary = streamingModel('gateway', { pull, cancel });
    const secondary = healthyStream();
    const model = failoverModel(primary, secondary);
    const result = await model.doStream({} as never);
    await expect(readParts(result.stream)).rejects.toThrow('metadata limit');
    expect(pull.mock.calls.length).toBeLessThan(20);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(secondary.doStream).not.toHaveBeenCalled();
  });

  it('returns the original stream unchanged when no secondary is configured', async () => {
    const primary = streamingModel('gateway', [
      { type: 'error', error: gatewayCreditsExhausted() },
    ]);
    const model = createCreditFailoverModel({
      label: 'jovie-chat',
      primary: { name: 'gateway', model: primary },
      secondary: { name: 'workers-ai', model: undefined },
    });
    const result = await model.doStream({} as never);
    const original = await primary.doStream.mock.results[0].value;
    expect(result).toBe(original);
    expect((await readParts(result.stream))[0].type).toBe('error');
  });

  it('preserves the SDK channel for a noneligible stream rejection', async () => {
    const error = new Error('Invalid provider response');
    const primary = streamingModel('gateway', {
      pull(controller) {
        controller.error(error);
      },
    });
    const secondary = healthyStream();
    const result = await failoverModel(primary, secondary).doStream(
      {} as never
    );
    await expect(readParts(result.stream)).rejects.toBe(error);
    expect(secondary.doStream).not.toHaveBeenCalled();
  });
});
