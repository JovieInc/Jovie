import 'server-only';

/**
 * Merch chat tool implementations.
 *
 * These are server-side closures the LLM calls during the authenticated
 * artist chat. They wrap the merch generator service and return structured
 * payloads the chat UI renders as merch cards.
 *
 * Implementation strategy:
 * - generateMerchOptions: takes a design concept, calls the merch generator
 *   service, and returns merch generation options for the UI
 * - previewMerchOptions: same as generate but with preview semantics
 * - selectMerchOption: picks a design option and creates a merch card
 *
 * @see @/lib/services/merch/merch-generator.ts - Core generation logic
 * @see @/lib/chat/tool-schemas.ts - Tool schema definitions
 * @see onboarding-tool-impls.ts - Similar pattern for onboarding tools
 */

import { tool } from 'ai';
import { z } from 'zod';
import { TOOL_SCHEMAS } from '@/lib/chat/tool-schemas';
import {
  generateMerchFromConcept,
  previewMerchFromConcept,
  selectAndCreateMerchCard,
} from '@/lib/services/merch/merch-generator';

// ---------------------------------------------------------------------------
// Tool factory functions
// ---------------------------------------------------------------------------

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
    execute: async ({ prompt, itemType, makeLive: _makeLive }) => {
      if (!params.profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }

      const result = await generateMerchFromConcept({
        profileId: params.profileId,
        clerkUserId: params.clerkUserId,
        prompt: prompt ?? 'Generate premium merch for this artist.',
        itemType: itemType ?? null,
        conversationId: params.conversationId ?? null,
        turnId: params.turnId ?? null,
      });

      return {
        ...result,
        nextStep: 'Pick 1, 2, or 3. You can also tell me what to change.',
      };
    },
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
    execute: async ({ prompt, itemType }) => {
      if (!params.profileId) {
        return { success: false as const, error: 'Profile ID required' };
      }

      const result = await previewMerchFromConcept({
        profileId: params.profileId,
        clerkUserId: params.clerkUserId,
        prompt: prompt ?? 'Preview premium merch for this artist.',
        itemType: itemType ?? null,
        conversationId: params.conversationId ?? null,
        turnId: params.turnId ?? null,
      });

      return {
        ...result,
        nextStep: 'Pick 1, 2, or 3. You can also tell me what to change.',
      };
    },
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

      return selectAndCreateMerchCard({
        generationId,
        clerkUserId: params.clerkUserId,
        optionId: optionId ?? null,
        optionNumber: optionNumber ?? null,
        publish: makeLive === true,
      });
    },
  });
}
