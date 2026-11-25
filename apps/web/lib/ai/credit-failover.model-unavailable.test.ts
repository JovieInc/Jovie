import { beforeEach, describe, expect, it } from 'vitest';
import {
  type AiFailoverEvent,
  creditBreakerOpen,
  isModelUnavailableError,
  resetCreditBreakers,
} from '@/lib/ai/credit-failover';
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

/** What the Workers AI relay returns when its live allowlist lacks the id. */
function relayModelNotAllowed(): Error {
  return Object.assign(new Error('model not allowed'), {
    name: 'AI_APICallError',
    statusCode: 400,
  });
}

/** What Cloudflare returns for a retired Workers AI model (410 Gone, 5028). */
function cloudflareModelRetired(): Error {
  return Object.assign(new Error('This model is no longer available.'), {
    name: 'AI_APICallError',
    statusCode: 410,
  });
}

describe('isModelUnavailableError', () => {
  it('recognizes the relay allowlist rejection and retired-model errors', () => {
    expect(isModelUnavailableError(relayModelNotAllowed())).toBe(true);
    expect(isModelUnavailableError(cloudflareModelRetired())).toBe(true);
    expect(
      isModelUnavailableError(JSON.stringify({ error: { code: 5028 } }))
    ).toBe(true);
    expect(
      isModelUnavailableError(
        new Error('Model zai/glm-5.3-flash is no longer available')
      )
    ).toBe(true);
  });

  it('does not treat ordinary or credit failures as model unavailability', () => {
    expect(isModelUnavailableError(new Error('socket hang up'))).toBe(false);
    expect(isModelUnavailableError(undefined)).toBe(false);
    expect(isModelUnavailableError(gatewayCreditsExhausted())).toBe(false);
    expect(isModelUnavailableError(workersAiOutOfCredits())).toBe(false);
  });
});

describe('model-unavailable failover (JOV-10063)', () => {
  beforeEach(() => resetCreditBreakers());

  it('fails over a relay allowlist rejection so a model-id mismatch cannot take chat down', async () => {
    const events: AiFailoverEvent[] = [];
    const served: { provider?: 'gateway' | 'workers-ai' } = {};
    const model = failoverModel(
      fakeModel('gateway', relayModelNotAllowed()),
      fakeModel('workers-ai', 'ok'),
      { served, onFailover: event => events.push(event) }
    );
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
        reason: 'error',
      },
    ]);
    expect(creditBreakerOpen('gateway')).toBe(true);
  });

  it('fails over a Cloudflare 410 Gone (retired Workers AI model)', async () => {
    const model = failoverModel(
      fakeModel('gateway', cloudflareModelRetired()),
      fakeModel('workers-ai', 'ok')
    );
    await expect(model.doGenerate({} as never)).resolves.toEqual({
      served: 'workers-ai',
    });
  });

  it.each(['rejection', 'error-part'] as const)(
    'recovers a model-not-allowed %s after the stream opens before content',
    async failure => {
      const rejected = relayModelNotAllowed();
      const primary = streamingModel('gateway', {
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: ['primary'] });
          controller.enqueue({ type: 'response-metadata', id: 'primary' });
        },
        pull(controller) {
          if (failure === 'rejection') controller.error(rejected);
          else {
            controller.enqueue({ type: 'error', error: rejected });
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
      ] satisfies StreamPart[]);
      expect(result.response.headers.provider).toBe('workers-ai');
      expect(secondary.doStream).toHaveBeenCalledTimes(1);
      expect(served.provider).toBe('workers-ai');
      expect(events).toMatchObject([{ reason: 'error' }]);
    }
  );
});
