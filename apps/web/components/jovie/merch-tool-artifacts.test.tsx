import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import { toolEventToMessagePart } from '@/lib/chat/tool-events';
import {
  MERCH_SOURCE_SELECTION_TITLE,
  MERCH_ZERO_DESIGNS_TITLE,
} from './merch-tool-artifacts';
import { hydratePersistedMessageParts } from './message-parts';
import { ToolPartsRenderer } from './tool-ui';

const mutateMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/queries', () => ({
  useConfirmChatMerchActionMutation: () => ({ mutate: mutateMock }),
}));

const sourceSelectionOutput = {
  success: true as const,
  state: 'source_selection_required' as const,
  message:
    'Choose a confirmed catalog phrase before Jovie generates any artwork.',
  recommendation: {
    sourceType: 'song_title',
    sourceText: 'Neon Skyline',
    provenanceTitle: 'Neon Skyline',
  },
  candidates: [
    {
      sourceType: 'song_title',
      sourceText: 'Neon Skyline',
      provenanceTitle: 'Neon Skyline',
    },
    {
      sourceType: 'album_title',
      sourceText: 'Midnight Drive',
      provenanceTitle: 'Midnight Drive',
    },
  ],
};

const zeroDesignsOutput = {
  success: true as const,
  generationId: 'gen-zero',
  prompt: 'Premium illustrated merch for this artist.',
  designs: [] as unknown[],
  nextStep: 'Jovie will not generate from unverified phrases.',
};

function succeededMerchEvent(
  output: Record<string, unknown>,
  overrides: Partial<PersistedToolEvent> = {}
): PersistedToolEvent {
  return {
    schemaVersion: 2,
    toolCallId: 'merch-call-1',
    toolName: 'createMerch',
    state: 'succeeded',
    uiHint: 'artifact',
    retryable: false,
    output,
    ...overrides,
  };
}

describe('ToolPartsRenderer merch honesty (PR-5)', () => {
  it('renders source_selection_required as an actionable phrase picker, not "ready"', async () => {
    const submitted: string[] = [];
    const onSubmit = (event: Event) => {
      submitted.push((event as CustomEvent<{ prompt: string }>).detail.prompt);
    };
    globalThis.addEventListener('jovie-chat-submit-prompt', onSubmit);
    try {
      render(
        <ToolPartsRenderer
          variant='chat'
          parts={[
            toolEventToMessagePart(succeededMerchEvent(sourceSelectionOutput)),
          ]}
        />
      );

      expect(
        screen.getByTestId('chat-merch-source-selection')
      ).toBeInTheDocument();
      expect(
        screen.getByText(sourceSelectionOutput.message)
      ).toBeInTheDocument();
      expect(screen.queryByText('Merch options ready')).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Neon Skyline' })
      );
      expect(submitted).toEqual(['Neon Skyline']);
    } finally {
      globalThis.removeEventListener('jovie-chat-submit-prompt', onSubmit);
    }
  });

  it('renders a zero-design carousel result as "no designs", never "ready"', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[toolEventToMessagePart(succeededMerchEvent(zeroDesignsOutput))]}
      />
    );

    expect(screen.getByTestId('chat-merch-zero-designs')).toBeInTheDocument();
    expect(screen.getByText(MERCH_ZERO_DESIGNS_TITLE)).toBeInTheDocument();
    expect(screen.getByText(zeroDesignsOutput.nextStep)).toBeInTheDocument();
    expect(screen.queryByText('Merch options ready')).not.toBeInTheDocument();
  });

  it('keeps real designs rendering as the carousel', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          toolEventToMessagePart(
            succeededMerchEvent({
              success: true,
              generationId: 'gen-1',
              designs: [
                {
                  id: 'd-1',
                  option_number: 1,
                  design_name: 'Neon Pulse',
                  status: 'ready',
                  preview_url: 'https://cdn.test/neon.jpg',
                },
              ],
            })
          ),
        ]}
      />
    );

    expect(
      screen.queryByText(MERCH_ZERO_DESIGNS_TITLE)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('chat-merch-source-selection')
    ).not.toBeInTheDocument();
  });

  it('gives the findMerchSources status row an outcome-aware title', () => {
    const event = succeededMerchEvent(sourceSelectionOutput, {
      toolName: 'findMerchSources',
      toolCallId: 'source-call-1',
      uiHint: 'status',
    });
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={hydratePersistedMessageParts('', [event])}
      />
    );

    expect(screen.getByTestId('tool-status-row')).toHaveAttribute(
      'data-tool-state',
      'succeeded'
    );
    expect(screen.getByText(MERCH_SOURCE_SELECTION_TITLE)).toBeInTheDocument();
    expect(screen.queryByText('Merch source ready')).not.toBeInTheDocument();
  });

  it('keeps the plain success title for real generation results', () => {
    render(
      <ToolPartsRenderer
        variant='chat'
        parts={[
          toolEventToMessagePart(
            succeededMerchEvent({
              success: true,
              generationId: 'gen-2',
              options: [
                {
                  id: 'opt-1',
                  option_number: 1,
                  design_name: 'Signal Tee',
                  product_type: 'Premium Tee',
                  concept: 'Typography-led tee.',
                },
              ],
            })
          ),
        ]}
      />
    );

    expect(screen.getByText('Signal Tee')).toBeInTheDocument();
  });
});
