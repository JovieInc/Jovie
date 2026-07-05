import { describe, expect, it } from 'vitest';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import {
  embedMobileMerchArtifactsInContent,
  isMobileMerchArtifactOutput,
} from '@/lib/mobile/chat/tool-artifacts';

const generationOutput = {
  success: true as const,
  generationId: 'gen-1',
  options: [
    {
      id: 'opt-1',
      option_number: 1,
      design_name: 'Signal Tee',
      product_type: 'Premium Tee',
      concept: 'Typography-led tee.',
      mockup_urls: ['https://cdn.test/signal.jpg'],
    },
  ],
};

function merchEvent(
  overrides: Pick<PersistedToolEvent, 'toolCallId' | 'toolName' | 'state'> &
    Partial<PersistedToolEvent>
): PersistedToolEvent {
  return {
    schemaVersion: 2,
    uiHint: 'artifact',
    retryable: false,
    ...overrides,
  };
}

describe('mobile chat tool artifacts', () => {
  it('recognizes merch tool outputs', () => {
    expect(isMobileMerchArtifactOutput(generationOutput)).toBe(true);
    expect(
      isMobileMerchArtifactOutput({
        success: true,
        generationId: 'gen-2',
        designs: [
          {
            id: 'd-1',
            option_number: 1,
            design_name: 'Neon Pulse',
            status: 'ready',
          },
        ],
      })
    ).toBe(true);
  });

  it('embeds succeeded merch tool events into tool_result blocks', () => {
    const embedded = embedMobileMerchArtifactsInContent(
      'Here are three ideas.',
      [
        merchEvent({
          toolCallId: 'call-1',
          toolName: 'createMerch',
          state: 'succeeded',
          output: generationOutput,
        }),
      ]
    );

    expect(embedded).toContain('Here are three ideas.');
    expect(embedded).toContain('<name>createMerch</name>');
    expect(embedded).toContain('"design_name":"Signal Tee"');
  });

  it('skips non-merch or failed tool events', () => {
    expect(
      embedMobileMerchArtifactsInContent('Done.', [
        merchEvent({
          toolCallId: 'call-2',
          toolName: 'createMerch',
          state: 'failed',
          output: { success: false },
        }),
        merchEvent({
          toolCallId: 'call-3',
          toolName: 'proposeProfileEdit',
          state: 'succeeded',
          output: { success: true },
        }),
      ])
    ).toBe('Done.');
  });
});
