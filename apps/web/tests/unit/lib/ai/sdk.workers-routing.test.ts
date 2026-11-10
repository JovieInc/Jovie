import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGatewayModel, envState } = vi.hoisted(() => ({
  mockGatewayModel: vi.fn((modelId: string) => ({
    provider: 'gateway',
    modelId,
    doGenerate: vi.fn(),
    doStream: vi.fn(),
  })),
  envState: { WORKERS_AI_TOKEN: undefined as string | undefined },
}));

vi.mock('@ai-sdk/gateway', () => ({
  createGateway: vi.fn(() => mockGatewayModel),
  gateway: vi.fn(),
}));

vi.mock('@/lib/env-server', () => ({
  env: new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'WORKERS_AI_TOKEN' ? envState.WORKERS_AI_TOKEN : undefined,
    }
  ),
}));

import { isProviderCreditError } from '@/lib/ai/credit-failover';
import { gateway, routeCallProvider } from '@/lib/ai/sdk';
import { STREAM_FIRST_CHUNK_TIMEOUT_MS } from '@/lib/ai/stream-stall-guard';

const gatewayModel = (id: string) => mockGatewayModel(id);
const modelOf = (args: readonly [unknown, ...unknown[]]) =>
  (args[0] as { model: { provider: string; modelId: string } }).model;

describe('Workers AI routing in the shared AI layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.WORKERS_AI_TOKEN = 'cf-test-token';
  });

  it('sends background calls to Workers AI first, with low reasoning', () => {
    const args = [
      {
        model: gatewayModel('zai/glm-5.3-flash'),
        prompt: 'classify',
        experimental_telemetry: { functionId: 'jovie-email-classifier' },
      },
    ] as const;
    const routed = routeCallProvider(args, {});
    const options = routed[0] as unknown as {
      providerOptions: { workersAi: { reasoningEffort: string } };
    };

    expect(modelOf(routed).provider).toBe('workers-ai.chat');
    expect(options.providerOptions.workersAi.reasoningEffort).toBe('low');
  });

  it('keeps chat on the Gateway (credit failover is in gateway())', () => {
    const args = [
      {
        model: gatewayModel('zai/glm-5.3'),
        prompt: 'hi',
        experimental_telemetry: { functionId: 'jovie-chat' },
      },
    ] as const;

    expect(routeCallProvider(args, {})).toBe(args);
  });

  it('leaves calls alone when Workers AI is not configured', () => {
    envState.WORKERS_AI_TOKEN = undefined;
    const args = [
      {
        model: gatewayModel('zai/glm-5.3-flash'),
        experimental_telemetry: { functionId: 'jovie-insight-generator' },
      },
    ] as const;

    expect(routeCallProvider(args, {})).toBe(args);
  });

  it('leaves models with no Workers AI twin alone (Jev stays on the Gateway)', () => {
    const args = [
      {
        model: gatewayModel('typesafe-ai/jev'),
        experimental_telemetry: { functionId: 'jovie-critic' },
      },
    ] as const;

    expect(routeCallProvider(args, {})).toBe(args);
  });

  it('leaves custom wrapper models (chat rotation) alone', () => {
    const rotating = {
      provider: 'jovie-gateway-rotate',
      modelId: 'zai/glm-5.3',
      doGenerate: vi.fn(),
      doStream: vi.fn(),
    };
    const args = [
      {
        model: rotating,
        experimental_telemetry: { functionId: 'jovie-insight-generator' },
      },
    ] as const;

    expect(routeCallProvider(args, {})).toBe(args);
  });

  it('fails a credit-exhausted Gateway call over to Workers AI (chat path)', async () => {
    const gatewayError = Object.assign(
      new Error('Insufficient funds. Add credits to continue.'),
      { name: 'GatewayInternalServerError', statusCode: 402 }
    );
    expect(isProviderCreditError(gatewayError)).toBe(true);
    mockGatewayModel.mockImplementationOnce((modelId: string) => ({
      provider: 'gateway',
      modelId,
      doGenerate: vi.fn(async () => {
        throw gatewayError;
      }),
      doStream: vi.fn(),
    }));
    const workersGenerate = vi.fn(async () => ({ text: 'from-workers-ai' }));
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        workersGenerate();
        return new Response(
          JSON.stringify({
            id: 'x',
            model: '@cf/zai-org/glm-5.3-flash',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: { role: 'assistant', content: 'from-workers-ai' },
              },
            ],
            usage: { prompt_tokens: 3, completion_tokens: 3, total_tokens: 6 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const model = gateway('zai/glm-5.3-flash') as unknown as {
      doGenerate: (options: unknown) => Promise<{
        content: { type: string; text?: string }[];
      }>;
    };
    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });

    expect(workersGenerate).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain(
      '/v1/chat/completions'
    );
    expect(result.content[0]?.text).toBe('from-workers-ai');
    fetchSpy.mockRestore();
  });

  it('bounds a Gateway stream that never answers, even with no Workers AI twin', async () => {
    envState.WORKERS_AI_TOKEN = undefined;
    vi.useFakeTimers();
    try {
      mockGatewayModel.mockReturnValueOnce({
        provider: 'gateway',
        modelId: 'zai/glm-5.3-flash',
        doGenerate: vi.fn(),
        doStream: vi.fn(() => new Promise(() => undefined)),
      });
      const model = gateway('zai/glm-5.3-flash') as unknown as {
        doStream: (options: unknown) => Promise<unknown>;
      };
      const pending = model.doStream({});
      const settled = expect(pending).rejects.toMatchObject({
        name: 'StreamStallError',
        phase: 'first-chunk',
      });
      await vi.advanceTimersByTimeAsync(STREAM_FIRST_CHUNK_TIMEOUT_MS + 1);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});
