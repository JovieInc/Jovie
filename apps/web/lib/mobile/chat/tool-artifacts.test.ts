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

  it('preserves existing bytes after JSONB key reordering and wire normalization', () => {
    const event = merchEvent({
      toolName: 'createMerch',
      toolCallId: 'call-1',
      state: 'succeeded',
      output: { ...generationOutput, omitted: undefined },
    });
    const live = embedMobileMerchArtifactsInContent('Original prose.  ', [
      event,
    ]);
    const reordered = {
      options: generationOutput.options.map(option =>
        Object.fromEntries(Object.entries(option).reverse())
      ),
      generationId: generationOutput.generationId,
      success: true,
    };
    expect(
      embedMobileMerchArtifactsInContent(live, [
        { ...event, output: reordered },
      ])
    ).toBe(live);
  });

  it('appends only missing valid artifacts to mixed legacy and embedded content', () => {
    const first = merchEvent({
      toolName: 'createMerch',
      toolCallId: 'first',
      state: 'succeeded',
      output: generationOutput,
    });
    const second = merchEvent({
      toolName: 'previewMerchOptions',
      toolCallId: 'second',
      state: 'succeeded',
      output: { success: true, generationId: 'preview', designs: [] },
    });
    const invalid = merchEvent({
      toolName: 'createMerch',
      toolCallId: 'bad',
      state: 'succeeded',
      output: { success: false },
    });
    const legacy = 'Legacy plain content';
    const live = embedMobileMerchArtifactsInContent(legacy, [first]);
    const missing = embedMobileMerchArtifactsInContent('', [second]);
    const mixed = embedMobileMerchArtifactsInContent(live, [
      first,
      second,
      invalid,
    ]);
    expect(mixed).toBe(`${live}\n${missing}`);
    expect(
      embedMobileMerchArtifactsInContent(mixed, [first, second, invalid])
    ).toBe(mixed);
    expect(embedMobileMerchArtifactsInContent(legacy, [first, second])).toBe(
      mixed
    );
  });

  it('retains distinct same-output call multiplicity across repeated reloads', () => {
    const first = merchEvent({
      toolName: 'createMerch',
      toolCallId: 'first',
      state: 'succeeded',
      output: generationOutput,
    });
    const second = { ...first, toolCallId: 'second' };
    const one = embedMobileMerchArtifactsInContent('', [first]);
    const two = embedMobileMerchArtifactsInContent(one, [first, second]);
    expect(two).toBe(`${one}\n${one}`);
    expect(embedMobileMerchArtifactsInContent(two, [first, second])).toBe(two);
  });

  it.each([
    'malformed-json',
    'failed-state',
    'unsupported-name',
    'failed-output',
    'different-output',
    'lookalike',
  ])('does not let a %s envelope suppress a valid artifact', kind => {
    const event = merchEvent({
      toolName: 'createMerch',
      toolCallId: 'call-1',
      state: 'succeeded',
      output: generationOutput,
    });
    const canonical = embedMobileMerchArtifactsInContent('', [event]);
    let existing = canonical;
    if (kind === 'malformed-json')
      existing = canonical.replace('<json>{', '<json>{not-json');
    if (kind === 'failed-state')
      existing = canonical.replace('<state>success', '<state>failed');
    if (kind === 'unsupported-name')
      existing = canonical.replace('<name>createMerch', '<name>unknown');
    if (kind === 'failed-output')
      existing = canonical.replace('"success":true', '"success":false');
    if (kind === 'different-output')
      existing = canonical.replace('gen-1', 'gen-other');
    if (kind === 'lookalike')
      existing = canonical.replace(
        '<tool_result>',
        '<tool_result extra="true">'
      );
    expect(embedMobileMerchArtifactsInContent(existing, [event])).toBe(
      `${existing}\n${canonical}`
    );
  });
});
