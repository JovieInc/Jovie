import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateTextMock, generateObjectMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(async (_options: unknown) => ({ text: 'ok' })),
  generateObjectMock: vi.fn(async (_options: unknown) => ({ object: {} })),
}));

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: generateTextMock,
    generateObject: generateObjectMock,
  };
});

vi.mock('@ai-sdk/gateway', () => ({
  createGateway: vi.fn(() => vi.fn()),
  gateway: vi.fn(),
}));

import {
  GATEWAY_APP_TAG,
  GATEWAY_UNTAGGED_FEATURE_TAG,
  generateObject,
  generateText,
  withGatewayReportingTags,
} from '@/lib/ai/sdk';

describe('withGatewayReportingTags', () => {
  beforeEach(() => vi.clearAllMocks());

  it('derives the feature tag from the telemetry function id', () => {
    expect(
      withGatewayReportingTags({
        prompt: 'x',
        experimental_telemetry: { functionId: 'jovie-email-classifier' },
      }).providerOptions
    ).toEqual({
      gateway: { tags: ['feature:jovie-email-classifier', GATEWAY_APP_TAG] },
    });
  });

  it('keeps caller tags and other provider options', () => {
    expect(
      withGatewayReportingTags({
        experimental_telemetry: { functionId: 'ignored' },
        providerOptions: {
          anthropic: { thinking: { type: 'disabled' } },
          gateway: { order: ['anthropic'], tags: ['feature:jovie-chat'] },
        },
      }).providerOptions
    ).toEqual({
      anthropic: { thinking: { type: 'disabled' } },
      gateway: {
        order: ['anthropic'],
        tags: ['feature:jovie-chat', GATEWAY_APP_TAG],
      },
    });
  });

  it('marks untagged call sites so they show up in the report', () => {
    expect(withGatewayReportingTags({ prompt: 'x' }).providerOptions).toEqual({
      gateway: { tags: [GATEWAY_UNTAGGED_FEATURE_TAG, GATEWAY_APP_TAG] },
    });
  });

  it('tags calls made through the wrapped SDK functions', async () => {
    await generateText({
      model: 'm' as never,
      prompt: 'x',
      experimental_telemetry: { functionId: 'hud-humanize-pr-title' },
    });
    await generateObject({
      model: 'm' as never,
      prompt: 'x',
      output: 'no-schema',
      experimental_telemetry: { functionId: 'jovie-insight-generator' },
    } as never);

    expect(generateTextMock.mock.calls[0]?.[0]).toMatchObject({
      providerOptions: {
        gateway: { tags: ['feature:hud-humanize-pr-title', GATEWAY_APP_TAG] },
      },
    });
    expect(generateObjectMock.mock.calls[0]?.[0]).toMatchObject({
      providerOptions: {
        gateway: {
          tags: ['feature:jovie-insight-generator', GATEWAY_APP_TAG],
        },
      },
    });
  });
});
