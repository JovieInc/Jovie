import { describe, expect, it } from 'vitest';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import {
  embedMobileMerchArtifactsInContent,
  isMobileMerchArtifactOutput,
} from '@/lib/mobile/chat/tool-artifacts';

const generationOutput = {
  success: true as const,
  generationId: '00000000-0000-4000-8000-000000000100',
  nextStep: 'Pick one.',
  options: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      option_number: 1,
      design_name: 'Signal Tee',
      product_type: 'Premium Tee',
      concept: 'A premium shirt with restrained artist typography.',
      mockup_urls: ['https://cdn.test/signal.jpg'],
    },
  ],
};

describe('mobile chat tool artifacts', () => {
  it('recognizes merch generation and design carousel outputs', () => {
    expect(isMobileMerchArtifactOutput(generationOutput)).toBe(true);
    expect(
      isMobileMerchArtifactOutput({
        success: true,
        generationId: 'g-1',
        designs: [
          {
            id: 'd-1',
            option_number: 1,
            design_name: 'Neon Pulse',
            concept: 'Bold type.',
            status: 'ready',
            preview_url: 'https://cdn.test/neon.png',
            slots: { artist_name: 'Tim White' },
          },
        ],
      })
    ).toBe(true);
  });

  it('embeds succeeded merch tool events into tool_result blocks', () => {
    const events: PersistedToolEvent[] = [
      {
        toolCallId: 'call-1',
        toolName: 'createMerch',
        state: 'succeeded',
        output: generationOutput,
        summary: null,
        errorCode: null,
        errorMessage: null,
        retryable: false,
      },
    ];

    const embedded = embedMobileMerchArtifactsInContent(
      'Here are three ideas.',
      events
    );

    expect(embedded).toContain('Here are three ideas.');
    expect(embedded).toContain('<tool_result>');
    expect(embedded).toContain('<name>createMerch</name>');
    expect(embedded).toContain('"design_name":"Signal Tee"');
    expect(embedded).not.toContain('**1.');
  });

  it('skips non-merch or failed tool events', () => {
    const events: PersistedToolEvent[] = [
      {
        toolCallId: 'call-2',
        toolName: 'createMerch',
        state: 'failed',
        output: { success: false },
        summary: 'Denied',
        errorCode: 'DENIED',
        errorMessage: 'Denied',
        retryable: false,
      },
      {
        toolCallId: 'call-3',
        toolName: 'proposeProfileEdit',
        state: 'succeeded',
        output: { success: true },
        summary: null,
        errorCode: null,
        errorMessage: null,
        retryable: false,
      },
    ];

    expect(embedMobileMerchArtifactsInContent('Done.', events)).toBe('Done.');
  });
});