import { describe, expect, it } from 'vitest';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import {
  MERCH_ZERO_DESIGNS_FALLBACK_MESSAGE,
  summarizeMobileMerchTurn,
} from '@/lib/mobile/chat/merch-tool-events';
import {
  embedMobileMerchArtifactsInContent,
  mobileMerchToolEventsFromResults,
} from '@/lib/mobile/chat/tool-artifacts';

const sourceSelectionOutput = {
  success: true as const,
  state: 'source_selection_required' as const,
  message:
    'Choose a confirmed catalog phrase before Jovie generates any artwork.',
  recommendation: null,
  candidates: [
    {
      sourceType: 'song_title',
      sourceText: 'Neon Skyline',
      provenanceTitle: 'Neon Skyline',
    },
  ],
};

const zeroDesignsOutput = {
  success: true as const,
  generationId: 'gen-zero',
  designs: [] as unknown[],
  nextStep: 'Jovie will not generate from unverified phrases.',
};

describe('mobile merch tool event derivation (PR-5)', () => {
  it('derives a failed event from a thrown-generation fail-soft output', () => {
    const events = mobileMerchToolEventsFromResults([
      {
        toolName: 'createMerch',
        toolCallId: 'call-1',
        output: { success: false, error: 'Merch generation failed.' },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      toolName: 'createMerch',
      state: 'failed',
      errorMessage: 'Merch generation failed.',
    });
    expect(events[0].state).not.toBe('succeeded');
  });

  it('derives a failed event for a zero-design generation and never marks it succeeded', () => {
    const events = mobileMerchToolEventsFromResults([
      {
        toolName: 'previewMerchOptions',
        toolCallId: 'call-2',
        output: zeroDesignsOutput,
      },
    ]);

    expect(events[0]).toMatchObject({
      toolName: 'previewMerchOptions',
      state: 'failed',
      errorMessage: zeroDesignsOutput.nextStep,
    });
  });

  it('uses a plain no-designs message when the result carries no nextStep', () => {
    const events = mobileMerchToolEventsFromResults([
      {
        toolName: 'createMerch',
        toolCallId: 'call-3',
        output: { success: true, generationId: 'gen-0', designs: [] },
      },
    ]);

    expect(events[0]).toMatchObject({
      state: 'failed',
      errorMessage: MERCH_ZERO_DESIGNS_FALLBACK_MESSAGE,
    });
  });

  it('keeps source-selection events as succeeded artifacts', () => {
    const events = mobileMerchToolEventsFromResults([
      {
        toolName: 'findMerchSources',
        toolCallId: 'call-4',
        output: sourceSelectionOutput,
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      toolName: 'findMerchSources',
      state: 'succeeded',
      uiHint: 'artifact',
    });
  });

  it('emits the source-selection artifact into the NDJSON content', () => {
    const event = {
      schemaVersion: 2 as const,
      toolCallId: 'call-4',
      toolName: 'findMerchSources',
      state: 'succeeded' as const,
      output: sourceSelectionOutput,
      retryable: false,
      uiHint: 'artifact' as const,
    };
    const embedded = embedMobileMerchArtifactsInContent('Pick a phrase.', [
      event,
    ]);

    expect(embedded).toContain('Pick a phrase.');
    expect(embedded).toContain('<name>findMerchSources</name>');
    expect(embedded).toContain('Neon Skyline');
    // Idempotent on replay reload.
    expect(embedMobileMerchArtifactsInContent(embedded, [event])).toBe(
      embedded
    );
  });

  it('summarizes the turn outcome from real event states', () => {
    const failed = {
      schemaVersion: 2 as const,
      toolCallId: 'call-1',
      toolName: 'createMerch',
      state: 'failed' as const,
      errorMessage: 'Merch generation failed.',
      retryable: false,
      uiHint: 'status' as const,
    } satisfies PersistedToolEvent;
    expect(summarizeMobileMerchTurn([failed], 0)).toEqual({
      completed: false,
      failureMessage: 'Merch generation failed.',
    });
    expect(summarizeMobileMerchTurn([failed], 12).completed).toBe(true);

    const succeeded = {
      ...failed,
      toolCallId: 'call-5',
      state: 'succeeded' as const,
      output: sourceSelectionOutput,
    };
    delete (succeeded as { errorMessage?: string }).errorMessage;
    expect(summarizeMobileMerchTurn([succeeded], 0).completed).toBe(true);
  });
});
