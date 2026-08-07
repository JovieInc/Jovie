import 'server-only';

/**
 * Merch chat tool implementations.
 *
 * These are server-side closures the LLM calls during the authenticated
 * artist chat. They wrap the merch generator service and return structured
 * payloads the chat UI renders as merch cards.
 *
 * Implementation strategy (JOV-4743):
 * - createMerch and previewMerchOptions share one executor that calls the
 *   canonical, quality-gated generator (`generateMerchDesigns`, see
 *   `@/lib/merch/generation-contract`) — there is no per-tool divergence.
 * - selectMerchOption: picks a design option and creates a merch card
 *
 * @see @/lib/merch/design-generation.ts - Canonical generation pipeline
 * @see @/lib/merch/generation-contract.ts - Versioned contract + receipt
 * @see @/lib/services/merch/merch-generator.ts - Legacy compatibility adapters
 * @see @/lib/chat/tool-schemas.ts - Tool schema definitions
 * @see onboarding-tool-impls.ts - Similar pattern for onboarding tools
 */

import { tool } from 'ai';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import { proposeMerchAction } from '@/lib/chat/tools/merch-propose';
import { generateMerchDesigns } from '@/lib/merch/design-generation';
import { buildMerchGenerationPrompt } from '@/lib/merch/generation-input';
import {
  getMerchSourceCandidates,
  isExplicitUserProvidedSource,
  type MerchSource,
  requiresAssetPreservingRender,
} from '@/lib/merch/source-candidates';
import {
  createAlternativeMerchFromCard,
  selectAndCreateMerchCard,
} from '@/lib/services/merch/merch-generator';

// ---------------------------------------------------------------------------
// Tool factory functions
// ---------------------------------------------------------------------------

function sourceSelectionResult(
  candidates: Awaited<ReturnType<typeof getMerchSourceCandidates>>
) {
  return {
    success: true as const,
    state: 'source_selection_required' as const,
    message:
      candidates.length > 0
        ? 'Choose a confirmed catalog phrase before Jovie generates any artwork.'
        : 'Jovie could not find a confirmed catalog title. Add a title or provide a phrase you own before generating artwork.',
    recommendation: candidates[0] ?? null,
    candidates,
    visualRule:
      'No people, faces, portraits, models, human figures, or unverified artist likenesses.',
  };
}

async function resolveVerifiedSource(params: {
  readonly profileId: string;
  readonly prompt: string;
  readonly source?: MerchSource;
}): Promise<
  | { readonly source: MerchSource }
  | { readonly sourceSelection: ReturnType<typeof sourceSelectionResult> }
  | { readonly error: string }
> {
  if (!params.source) {
    return {
      sourceSelection: sourceSelectionResult(
        await getMerchSourceCandidates(params.profileId)
      ),
    };
  }

  if (requiresAssetPreservingRender(params.source)) {
    return {
      error:
        'Jovie will not recreate an uploaded logo from a prompt. This Library asset needs the asset-preserving render path before it can be used for merch.',
    };
  }

  if (isExplicitUserProvidedSource(params.prompt, params.source)) {
    return { source: params.source };
  }

  const candidates = await getMerchSourceCandidates(params.profileId);
  const match = candidates.find(
    candidate =>
      candidate.sourceType === params.source?.sourceType &&
      candidate.sourceText.localeCompare(
        params.source?.sourceText ?? '',
        undefined,
        {
          sensitivity: 'accent',
        }
      ) === 0
  );
  if (!match) {
    return {
      error:
        'That merch source is not a confirmed title in this artist’s catalog. Choose a listed source or provide a phrase you own.',
    };
  }

  return { source: match };
}

/**
 * Returns source-backed title candidates before any image/model call. The chat
 * model turns this compact payload into the phrase picker conversation.
 */
export function createMerchSourceTool(params: {
  readonly profileId: string | null;
}) {
  return tool({
    description: TOOL_SCHEMAS.findMerchSources.description,
    inputSchema: TOOL_SCHEMAS.findMerchSources.inputSchema,
    execute: async () => {
      if (!params.profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }
      return sourceSelectionResult(
        await getMerchSourceCandidates(params.profileId)
      );
    },
  });
}

/**
 * Shared executor for both generation chat tools (JOV-4743).
 *
 * `createMerch` and `previewMerchOptions` differ only in the fallback prompt
 * goal; everything else — the versioned prompt contract, the verified-source /
 * no-person gate, and the canonical `generateMerchDesigns` pipeline with its
 * quality evidence and publish blockers — is this single code path, so neither
 * tool can drift or bypass the gate.
 */
async function executeCanonicalMerchGeneration(
  params: {
    readonly profileId: string | null;
    readonly clerkUserId: string;
    readonly conversationId?: string | null;
    readonly turnId?: string | null;
    readonly fallbackPrompt: string;
  },
  input: {
    readonly prompt?: string;
    readonly itemType?: string;
    readonly source?: MerchSource;
  }
) {
  if (!params.profileId) {
    return { success: false as const, error: 'Profile ID required' };
  }

  const generationPrompt = buildMerchGenerationPrompt(
    input.prompt,
    input.itemType,
    params.fallbackPrompt
  );
  const sourceResolution = await resolveVerifiedSource({
    profileId: params.profileId,
    prompt: generationPrompt.prompt,
    source: input.source,
  });
  if ('error' in sourceResolution) {
    return { success: false as const, error: sourceResolution.error };
  }
  if ('sourceSelection' in sourceResolution) {
    return sourceResolution.sourceSelection;
  }

  const result = await generateMerchDesigns({
    profileId: params.profileId,
    clerkUserId: params.clerkUserId,
    prompt: generationPrompt.prompt,
    source: sourceResolution.source,
    conversationId: params.conversationId ?? null,
    turnId: params.turnId ?? null,
  });
  return {
    ...result,
    ...(generationPrompt.usedDefaultItemType
      ? {
          productTypeNotice:
            'Started with a premium tee. You can switch the product after choosing a design.',
        }
      : {}),
  };
}

/**
 * Creates the generate merch options chat tool.
 * Attached to the authenticated chat toolset when the artist has
 * merch creation access.
 */
export function createMerchGenerateTool(params: {
  readonly profileId: string | null;
  readonly clerkUserId: string;
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
}) {
  return tool({
    description: TOOL_SCHEMAS.createMerch.description,
    inputSchema: TOOL_SCHEMAS.createMerch.inputSchema,
    execute: async ({ prompt, itemType, makeLive: _makeLive, source }) =>
      executeCanonicalMerchGeneration(
        {
          ...params,
          fallbackPrompt: 'Premium illustrated merch for this artist.',
        },
        { prompt, itemType, source }
      ),
  });
}

/**
 * Creates the preview merch options chat tool.
 * Shows design concepts without committing to a full publish flow.
 */
export function createMerchPreviewTool(params: {
  readonly profileId: string | null;
  readonly clerkUserId: string;
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
}) {
  return tool({
    description: TOOL_SCHEMAS.previewMerchOptions.description,
    inputSchema: TOOL_SCHEMAS.previewMerchOptions.inputSchema,
    execute: async ({ prompt, itemType, source }) =>
      executeCanonicalMerchGeneration(
        {
          ...params,
          fallbackPrompt: 'Premium illustrated merch concepts for this artist.',
        },
        { prompt, itemType, source }
      ),
  });
}

/**
 * Creates the select merch design chat tool.
 * Picks one of the three options from a previous generation and
 * creates a merch card (draft or live).
 */
export function createMerchSelectTool(params: {
  readonly profileId: string | null;
  readonly clerkUserId: string;
}) {
  return tool({
    description: TOOL_SCHEMAS.selectMerchDesign.description,
    inputSchema: TOOL_SCHEMAS.selectMerchDesign.inputSchema,
    execute: async ({ generationId, optionNumber, optionId, makeLive }) => {
      if (!params.profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }

      const result = await selectAndCreateMerchCard({
        generationId,
        clerkUserId: params.clerkUserId,
        optionId: optionId ?? null,
        optionNumber: optionNumber ?? null,
        publish: false,
      });

      if (makeLive === true && result.success && params.profileId) {
        const publishProposal = await proposeMerchAction({
          action: 'publish',
          merchCardId: result.merchCardId,
          profileId: params.profileId,
        });
        return { ...result, publishProposal };
      }

      return result;
    },
  });
}

export function createMerchAlternativeTool(params: {
  readonly profileId: string | null;
  readonly clerkUserId: string;
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
}) {
  return tool({
    description: TOOL_SCHEMAS.createMerchAlternativeItem.description,
    inputSchema: TOOL_SCHEMAS.createMerchAlternativeItem.inputSchema,
    execute: async ({ merchCardId, itemType }) => {
      if (!params.profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }

      return createAlternativeMerchFromCard({
        merchCardId,
        profileId: params.profileId,
        clerkUserId: params.clerkUserId,
        itemType,
        conversationId: params.conversationId ?? null,
        turnId: params.turnId ?? null,
      });
    },
  });
}
