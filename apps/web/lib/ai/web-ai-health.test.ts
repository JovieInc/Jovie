import { describe, expect, it, vi } from 'vitest';
import {
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
});
