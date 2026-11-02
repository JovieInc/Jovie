import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AiFailoverEvent,
  createCreditFailoverModel,
  creditBreakerOpen,
  isProviderCreditError,
  resetCreditBreakers,
} from '@/lib/ai/credit-failover';

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

function fakeModel(label: string, behavior: 'ok' | Error) {
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
    const model = createCreditFailoverModel({
      label: 'jovie-chat',
      primary: { name: 'gateway', model: gateway },
      secondary: { name: 'workers-ai', model: workers },
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
    const model = createCreditFailoverModel({
      label: 'jovie-chat',
      primary: {
        name: 'gateway',
        model: fakeModel('gateway', gatewayCreditsExhausted()),
      },
      secondary: { name: 'workers-ai', model: fakeModel('workers-ai', 'ok') },
      onFailover: () => undefined,
    });

    await expect(model.doStream({} as never)).resolves.toEqual({
      stream: 'workers-ai',
    });
  });

  it('opens a breaker so the next calls skip the dead provider', async () => {
    const gateway = fakeModel('gateway', gatewayCreditsExhausted());
    const workers = fakeModel('workers-ai', 'ok');
    const events: AiFailoverEvent[] = [];
    let clock = 1_000;
    const model = createCreditFailoverModel({
      label: 'x',
      primary: { name: 'gateway', model: gateway },
      secondary: { name: 'workers-ai', model: workers },
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
    const model = createCreditFailoverModel({
      label: 'x',
      primary: { name: 'gateway', model: fakeModel('gateway', boom) },
      secondary: { name: 'workers-ai', model: fakeModel('workers-ai', 'ok') },
      onFailover: () => undefined,
    });

    await expect(model.doGenerate({} as never)).rejects.toBe(boom);
  });

  it('never fails over an aborted call', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const workers = fakeModel('workers-ai', 'ok');
    const model = createCreditFailoverModel({
      label: 'x',
      primary: { name: 'gateway', model: fakeModel('gateway', aborted) },
      secondary: { name: 'workers-ai', model: workers },
      onFailover: () => undefined,
    });

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
