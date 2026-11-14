'use client';

import { Button } from '@jovie/ui';
import type { ReactNode } from 'react';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import {
  ChatMerchOptionsCard,
  isChatMerchGenerationResult,
} from './components/ChatMerchCard';
import {
  ChatMerchDesignCarousel,
  ChatMerchDesignCarouselLoading,
  isChatMerchDesignCarouselResult,
} from './components/ChatMerchDesignCarousel';

/**
 * Honest merch chat artifact rendering (PR-5).
 *
 * `createMerch` / `previewMerchOptions` can succeed without generating
 * anything: a `source_selection_required` payload (no confirmed catalog
 * phrase, no generationId) or a zero-design carousel result. Both used to
 * fall through to the generic "Merch options ready" status row. This module
 * renders those outcomes truthfully with existing UI primitives.
 */

export const MERCH_SOURCE_SELECTION_TITLE = 'Choose a merch phrase';
export const MERCH_ZERO_DESIGNS_TITLE = 'No merch designs came back';

const MAX_SOURCE_CANDIDATE_BUTTONS = 4;

interface MerchSourceCandidateView {
  readonly sourceType: string;
  readonly sourceText: string;
  readonly provenanceTitle: string;
}

function isMerchSourceSelectionOutput(output: unknown): output is {
  readonly success: true;
  readonly state: 'source_selection_required';
  readonly message: string;
  readonly candidates: readonly MerchSourceCandidateView[];
} {
  if (typeof output !== 'object' || output === null) return false;
  const record = output as Record<string, unknown>;
  return (
    record.success === true &&
    record.state === 'source_selection_required' &&
    typeof record.message === 'string' &&
    Array.isArray(record.candidates)
  );
}

function isZeroDesignMerchOutput(output: unknown): boolean {
  return isChatMerchDesignCarouselResult(output) && output.designs.length === 0;
}

function submitMerchPrompt(prompt: string): void {
  globalThis.dispatchEvent(
    new CustomEvent('jovie-chat-submit-prompt', { detail: { prompt } })
  );
}

export function ChatMerchSourceSelectionCard(props: {
  readonly message: string;
  readonly candidates: readonly MerchSourceCandidateView[];
}) {
  const actionable = props.candidates.slice(0, MAX_SOURCE_CANDIDATE_BUTTONS);
  return (
    <output
      data-testid='chat-merch-source-selection'
      className='flex flex-col gap-2'
    >
      <p className='text-2xs text-secondary-token'>{props.message}</p>
      {actionable.map(candidate => (
        <Button
          key={candidate.sourceText}
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => submitMerchPrompt(candidate.sourceText)}
        >
          {candidate.sourceText}
        </Button>
      ))}
    </output>
  );
}

export function ChatMerchZeroDesignCard(props: { readonly message?: string }) {
  return (
    <output
      data-testid='chat-merch-zero-designs'
      className='flex flex-col gap-2'
    >
      <span className='text-2xs font-medium text-secondary-token'>
        {MERCH_ZERO_DESIGNS_TITLE}
      </span>
      {props.message ? (
        <p className='text-2xs text-tertiary-token'>{props.message}</p>
      ) : null}
    </output>
  );
}

/** Outcome-aware status-row title override; null keeps the registry title. */
export function merchOutcomeStatusTitle(
  event: PersistedToolEvent
): string | null {
  if (event.state !== 'succeeded') return null;
  if (isMerchSourceSelectionOutput(event.output)) {
    return MERCH_SOURCE_SELECTION_TITLE;
  }
  if (isZeroDesignMerchOutput(event.output)) {
    return MERCH_ZERO_DESIGNS_TITLE;
  }
  return null;
}

export function renderMerchGenerationArtifact(
  event: PersistedToolEvent,
  profileId?: string
): ReactNode {
  if (event.state === 'running') {
    return <ChatMerchDesignCarouselLoading />;
  }
  if (event.state === 'failed') {
    // Falls through to the shared artifact failure card in tool-ui.
    return null;
  }
  const output = event.output;
  if (!output) {
    return null;
  }
  if (isMerchSourceSelectionOutput(output)) {
    return (
      <ChatMerchSourceSelectionCard
        message={output.message}
        candidates={output.candidates}
      />
    );
  }
  if (isZeroDesignMerchOutput(output)) {
    return (
      <ChatMerchZeroDesignCard
        message={
          typeof output.nextStep === 'string' && output.nextStep.length > 0
            ? output.nextStep
            : undefined
        }
      />
    );
  }
  if (isChatMerchDesignCarouselResult(output)) {
    return <ChatMerchDesignCarousel result={output} profileId={profileId} />;
  }
  if (isChatMerchGenerationResult(output)) {
    return <ChatMerchOptionsCard result={output} />;
  }
  return null;
}
