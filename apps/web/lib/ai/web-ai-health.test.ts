import { streamText as actualStreamText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';

const sdkMocks = vi.hoisted(() => ({
  gateway: vi.fn((model: string) => model),
  generateObject: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@/lib/ai/sdk', () => sdkMocks);

import {
  executeWebAiHealthProbe,
  repairWebAiHealthObjectText,
  runWebAiHealth,
  WEB_AI_HEALTH_PROBES,
  WEB_AI_HEALTH_RECEIPT_SCHEMA,
} from '@/lib/ai/web-ai-health';
import {
  CHAT_MODEL,
  GATEWAY_ALLOWED_MODELS,
  GATEWAY_ALLOWLIST_NAME,
  INSIGHT_MODEL,
  PACKAGING_INTELLIGENCE_MODEL,
  PITCH_MODEL,
  TITLE_MODEL,
} from '@/lib/constants/ai-models';

describe('runWebAiHealth', () => {
  it('reserves output tokens for always-on GLM reasoning in every SDK mode', async () => {
    sdkMocks.streamText.mockReturnValue({ text: Promise.resolve('healthy') });
    sdkMocks.generateText.mockResolvedValue({ text: 'healthy' });
    sdkMocks.generateObject.mockResolvedValue({
      object: { response: 'healthy' },
    });

    await Promise.all([
      executeWebAiHealthProbe({
        surface: 'web_chat',
        model: CHAT_MODEL,
        mode: 'stream',
        prompt: 'healthy',
      }),
      executeWebAiHealthProbe({
        surface: 'titles',
        model: TITLE_MODEL,
        mode: 'text',
        prompt: 'healthy',
      }),
      executeWebAiHealthProbe({
        surface: 'insights',
        model: INSIGHT_MODEL,
        mode: 'structured',
        prompt: 'healthy',
      }),
    ]);

    const textOptions = expect.objectContaining({
      maxOutputTokens: 1_024,
      maxRetries: 0,
      reasoning: 'low',
    });
    expect(sdkMocks.streamText).toHaveBeenCalledWith(textOptions);
    expect(sdkMocks.generateText).toHaveBeenCalledWith(textOptions);
    expect(sdkMocks.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 4_096,
        maxRetries: 0,
        reasoning: 'low',
        schemaName: 'WebAiHealthSignal',
      })
    );
  });

  it('repairs fenced and extra-field JSON into the health object', () => {
    const fenced = `\`\`\`json\n{"response":"${'x'.repeat(250)}"}\n\`\`\``;
    expect(JSON.parse(repairWebAiHealthObjectText(fenced) ?? '')).toEqual({
      response: 'x'.repeat(200),
    });
    expect(
      JSON.parse(
        repairWebAiHealthObjectText(
          'note {"spotify":"healthy pitch","appleMusic":""} trailing'
        ) ?? ''
      )
    ).toEqual({ response: 'healthy pitch' });
    expect(repairWebAiHealthObjectText('healthy, but not json')).toBeNull();
    expect(repairWebAiHealthObjectText('{"response":"   "}')).toBeNull();
  });

  it('retries one structured generation when the model returns no object', async () => {
    const noObject = new Error(
      'No object generated: the model did not return a response.'
    );
    noObject.name = 'AI_NoObjectGeneratedError';
    sdkMocks.generateObject.mockReset();
    sdkMocks.generateObject
      .mockRejectedValueOnce(noObject)
      .mockResolvedValueOnce({ object: { response: 'healthy' } });

    await expect(
      executeWebAiHealthProbe({
        surface: 'pitches',
        model: PITCH_MODEL,
        mode: 'structured',
        prompt: 'healthy',
      })
    ).resolves.toBe('healthy');
    expect(sdkMocks.generateObject).toHaveBeenCalledTimes(2);
  });

  it('does not retry a structured probe after a transport error', async () => {
    sdkMocks.generateObject.mockReset();
    sdkMocks.generateObject.mockRejectedValueOnce(
      new Error('connection reset')
    );

    await expect(
      executeWebAiHealthProbe({
        surface: 'pitches',
        model: PITCH_MODEL,
        mode: 'structured',
        prompt: 'healthy',
      })
    ).rejects.toThrow('connection reset');
    expect(sdkMocks.generateObject).toHaveBeenCalledTimes(1);
  });

  it('retries one transient Gateway 5xx per surface and keeps the receipt green', async () => {
    const gateway500 = Object.assign(new Error('Gateway upstream error'), {
      name: 'GatewayResponseError',
      status: 500,
    });
    const executeProbe = vi
      .fn()
      .mockRejectedValueOnce(gateway500)
      .mockResolvedValue('healthy');

    const receipt = await runWebAiHealth({ executeProbe });

    expect(receipt.status).toBe('passed');
    expect(receipt.results.every(result => result.ok)).toBe(true);
    // Five surfaces; the first probe's 500 is retried exactly once.
    expect(executeProbe).toHaveBeenCalledTimes(6);
  });

  it('fails a persistent Gateway 500 after one bounded retry, never more', async () => {
    const gateway500 = Object.assign(new Error('Gateway upstream error'), {
      name: 'GatewayResponseError',
      status: 500,
    });
    const executeProbe = vi.fn().mockRejectedValue(gateway500);

    const receipt = await runWebAiHealth({ executeProbe });

    expect(receipt.status).toBe('failed');
    for (const result of receipt.results) {
      expect(result).toMatchObject({
        ok: false,
        failureCause: 'request_error',
        message: expect.stringContaining('GatewayResponseError:500'),
      });
    }
    // Five surfaces, exactly two attempts each: one retry, no unbounded loop.
    expect(executeProbe).toHaveBeenCalledTimes(10);
  });

  it('does not retry a forbidden 403 transport error', async () => {
    const forbidden403 = Object.assign(new Error('model is forbidden'), {
      statusCode: 403,
    });
    const executeProbe = vi
      .fn()
      .mockRejectedValueOnce(forbidden403)
      .mockResolvedValue('healthy');

    const receipt = await runWebAiHealth({ executeProbe });

    // The rejected probe is NOT retried; the other four probes pass.
    expect(executeProbe).toHaveBeenCalledTimes(5);
    const failed = receipt.results.filter(result => !result.ok);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ failureCause: 'forbidden_model' });
  });

  it.each([502, 503, 504, 599])(
    'retries a Gateway statusCode %i exactly once on every surface',
    async statusCode => {
      const attempts = new Map<string, number>();
      const executeProbe = vi.fn(async ({ surface }: { surface: string }) => {
        const attempt = (attempts.get(surface) ?? 0) + 1;
        attempts.set(surface, attempt);
        if (attempt === 1) {
          throw Object.assign(new Error('Gateway upstream error'), {
            statusCode,
          });
        }
        return 'healthy';
      });

      const receipt = await runWebAiHealth({ executeProbe });

      expect(receipt.status).toBe('passed');
      expect([...attempts.values()]).toEqual([2, 2, 2, 2, 2]);
      expect(executeProbe).toHaveBeenCalledTimes(10);
    }
  );

  it.each([400, 429, 499, 600, 500.5, '503', undefined])(
    'does not retry a request error outside integer HTTP 5xx: %s',
    async statusCode => {
      const executeProbe = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('Request failed'), { statusCode })
        );

      const receipt = await runWebAiHealth({ executeProbe });

      expect(receipt.status).toBe('failed');
      expect(executeProbe).toHaveBeenCalledTimes(5);
      expect(receipt.results.every(result => !result.ok)).toBe(true);
    }
  );

  it.each([
    { status: 500, failures: 1, attempts: 2, result: 'passed' },
    { status: 503, failures: 1, attempts: 2, result: 'passed' },
    { status: 500, failures: 2, attempts: 2, result: 'failed' },
    { status: 403, failures: 1, attempts: 1, result: 'failed' },
  ])(
    'preserves real SDK stream errors: $status, $failures failure(s)',
    async scenario => {
      const model = new MockLanguageModelV4({
        doStream: async () => {
          if (model.doStreamCalls.length <= scenario.failures) {
            throw Object.assign(new Error('private provider response'), {
              name: 'GatewayResponseError',
              status: scenario.status,
            });
          }
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'text-start', id: 'text' });
                controller.enqueue({
                  type: 'text-delta',
                  id: 'text',
                  delta: 'healthy',
                });
                controller.enqueue({ type: 'text-end', id: 'text' });
                controller.enqueue({
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage: {
                    inputTokens: {
                      total: 1,
                      noCache: 1,
                      cacheRead: 0,
                      cacheWrite: 0,
                    },
                    outputTokens: { total: 1, text: 1, reasoning: 0 },
                  },
                });
                controller.close();
              },
            }),
          };
        },
      });
      await sdkMocks.streamText.withImplementation(
        options => actualStreamText({ ...options, model }),
        async () => {
          const receipt = await runWebAiHealth({
            executeProbe: definition =>
              definition.mode === 'stream'
                ? executeWebAiHealthProbe(definition)
                : Promise.resolve('healthy'),
          });
          expect(receipt.status).toBe(scenario.result);
          expect(model.doStreamCalls).toHaveLength(scenario.attempts);
          if (scenario.result === 'failed') {
            expect(receipt.results[0].failureCause).toBe(
              scenario.status === 403 ? 'forbidden_model' : 'request_error'
            );
          }
          expect(JSON.stringify(receipt)).not.toContain(
            'private provider response'
          );
        }
      );
    }
  );

  it('runs one bounded probe for every production Web AI surface', async () => {
    const executeProbe = vi.fn().mockResolvedValue('healthy');

    const receipt = await runWebAiHealth({
      executeProbe,
      now: () => new Date('2026-09-28T07:00:00.000Z'),
    });

    expect(executeProbe).toHaveBeenCalledTimes(5);
    expect(WEB_AI_HEALTH_PROBES).toEqual([
      expect.objectContaining({
        surface: 'web_chat',
        model: CHAT_MODEL,
        mode: 'stream',
      }),
      expect.objectContaining({
        surface: 'insights',
        model: INSIGHT_MODEL,
        mode: 'structured',
      }),
      expect.objectContaining({
        surface: 'pitches',
        model: PITCH_MODEL,
        mode: 'structured',
      }),
      expect.objectContaining({
        surface: 'titles',
        model: TITLE_MODEL,
        mode: 'text',
      }),
      expect.objectContaining({
        surface: 'packaging',
        model: PACKAGING_INTELLIGENCE_MODEL,
        mode: 'structured',
      }),
    ]);
    expect(receipt).toMatchObject({
      schema: WEB_AI_HEALTH_RECEIPT_SCHEMA,
      checkedAt: '2026-09-28T07:00:00.000Z',
      environment: 'production',
      status: 'passed',
      signal: { severity: 'high', route: 'bug' },
      gatewayAllowlist: {
        name: GATEWAY_ALLOWLIST_NAME,
        models: GATEWAY_ALLOWED_MODELS,
      },
    });
    expect(receipt.results).toHaveLength(5);
    expect(receipt.results.every(result => result.ok)).toBe(true);
    expect(GATEWAY_ALLOWLIST_NAME).toBe('founder-strict-2026-09-17');
    for (const probe of WEB_AI_HEALTH_PROBES) {
      expect(GATEWAY_ALLOWED_MODELS).toContain(probe.model);
    }
    expect(
      WEB_AI_HEALTH_PROBES.filter(probe => probe.mode === 'structured').map(
        probe => probe.prompt
      )
    ).toEqual([
      'Return JSON {"response":"healthy"} and no other text.',
      'Return JSON {"response":"healthy"} and no other text.',
      'Return JSON {"response":"healthy"} and no other text.',
    ]);
  });

  it('distinguishes forbidden, empty, placeholder-saved, and request failures', async () => {
    const receipt = await runWebAiHealth({
      executeProbe: async definition => {
        switch (definition.surface) {
          case 'web_chat':
            throw Object.assign(new Error('model is forbidden'), {
              statusCode: 403,
            });
          case 'insights':
            return '   ';
          case 'pitches':
            return 'Done. What would you like to do next?';
          case 'titles':
            throw new Error('connection reset');
          case 'packaging':
            return 'healthy';
        }
      },
    });

    expect(receipt.status).toBe('failed');
    expect(receipt.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surface: 'web_chat',
          failureCause: 'forbidden_model',
          message: expect.stringContaining('rejected as forbidden'),
        }),
        expect.objectContaining({
          surface: 'insights',
          failureCause: 'empty_stream',
          message: expect.stringContaining(
            'completed without response content'
          ),
        }),
        expect.objectContaining({
          surface: 'pitches',
          failureCause: 'placeholder_saved',
          message: expect.stringContaining('saved placeholder sentinel'),
        }),
        expect.objectContaining({
          surface: 'titles',
          failureCause: 'request_error',
          message: expect.stringContaining('production Gateway probe failed'),
        }),
      ])
    );
    for (const failure of receipt.results.filter(result => !result.ok)) {
      expect(failure.message).toContain(GATEWAY_ALLOWLIST_NAME);
    }
  });

  it('treats a successful forbidden sentinel as a forbidden model rejection', async () => {
    const receipt = await runWebAiHealth({
      executeProbe: async definition =>
        definition.surface === 'packaging'
          ? { response: 'Forbidden' }
          : 'healthy',
    });

    expect(receipt.results.at(-1)).toMatchObject({
      surface: 'packaging',
      ok: false,
      failureCause: 'forbidden_model',
    });
  });

  it('classifies a forbidden provider error even when no status code is attached', async () => {
    const receipt = await runWebAiHealth({
      executeProbe: async definition => {
        if (definition.surface === 'web_chat') {
          throw new Error('Gateway model is forbidden by project policy');
        }
        return 'healthy';
      },
    });

    expect(receipt.results[0]).toMatchObject({
      surface: 'web_chat',
      failureCause: 'forbidden_model',
    });
  });

  it('never includes model response text in the redacted receipt', async () => {
    const secretOutput = 'healthy-but-user-specific-output';
    const receipt = await runWebAiHealth({
      executeProbe: vi.fn().mockResolvedValue(secretOutput),
    });

    expect(JSON.stringify(receipt)).not.toContain(secretOutput);
  });

  it('classifies a structured miss without copying the model text', async () => {
    const secret = 'user-pitch-body-secret';
    const error = new Error(
      'No object generated: response did not match schema.'
    );
    error.name = 'AI_NoObjectGeneratedError';
    Object.assign(error, { finishReason: 'stop', text: secret });

    const receipt = await runWebAiHealth({
      executeProbe: async definition => {
        if (definition.surface === 'pitches') throw error;
        return 'healthy';
      },
    });

    const pitches = receipt.results.find(
      result => result.surface === 'pitches'
    );
    expect(pitches).toMatchObject({
      ok: false,
      failureCause: 'request_error',
      model: PITCH_MODEL,
    });
    expect(pitches?.message).toContain(
      'AI_NoObjectGeneratedError:schema_mismatch:stop'
    );
    expect(JSON.stringify(receipt)).not.toContain(secret);
  });
});
