import { generateObject } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const envState = vi.hoisted(() => ({
  WORKERS_AI_TOKEN: 'cf-test-token' as string | undefined,
  WORKERS_AI_BASE_URL: undefined as string | undefined,
}));

vi.mock('@/lib/env-server', () => ({
  env: new Proxy(
    {},
    { get: (_target, key) => envState[key as keyof typeof envState] }
  ),
}));

import {
  isWorkersAiConfigured,
  WORKERS_AI_MODEL_MAP,
  WORKERS_AI_RELAY_BASE_URL,
  workersAiLanguageModel,
  workersAiModelFor,
} from '@/lib/ai/workers-ai';
import { GATEWAY_ALLOWED_MODELS } from '@/lib/constants/ai-models';

describe('lib/ai/workers-ai', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    envState.WORKERS_AI_TOKEN = 'cf-test-token';
  });

  it('only maps Gateway-allowlisted, non-banned models to Workers AI twins', () => {
    for (const gatewayId of Object.keys(WORKERS_AI_MODEL_MAP)) {
      expect(GATEWAY_ALLOWED_MODELS).toContain(gatewayId);
      expect(gatewayId).not.toMatch(/^(openai|anthropic)\//u);
    }
    expect(workersAiModelFor('typesafe-ai/jev')).toBeUndefined();
  });

  it('is off without a token', () => {
    envState.WORKERS_AI_TOKEN = undefined;
    expect(isWorkersAiConfigured()).toBe(false);
    expect(workersAiLanguageModel('zai/glm-5.3-flash')).toBeUndefined();
  });

  it('asks for schema-enforced structured output on the relay', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      expect(String(url)).toBe(`${WORKERS_AI_RELAY_BASE_URL}/chat/completions`);
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          id: 'x',
          model: '@cf/zai-org/glm-5.3-flash',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: '{"category":"spam"}' },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });

    const model = workersAiLanguageModel('zai/glm-5.3-flash');
    expect(model).toBeDefined();
    const { object } = await generateObject({
      model: model as never,
      schema: z.object({ category: z.enum(['spam', 'other']) }),
      prompt: 'classify',
    });

    expect(object).toEqual({ category: 'spam' });
    expect(bodies[0]?.model).toBe('@cf/zai-org/glm-5.3-flash');
    expect(bodies[0]?.response_format).toMatchObject({ type: 'json_schema' });
  });
});
