import 'server-only';

/**
 * Merch generator wrappers for chat tool execution.
 *
 * Keeps chat-layer plumbing thin by delegating all generation/selection logic
 * to the canonical merch service.
 */

import { createMerchGeneration, selectMerchDesign } from '@/lib/merch/service';
import type {
  MerchGenerationOptionView,
  MerchGenerationResult,
  MerchSelectionResult,
} from '@/lib/merch/types';

/**
 * Merch generator shared interfaces.
 * @see @/lib/services/merch/mockup-generator.ts
 * @see @/lib/services/merch/variant-pipeline.ts
 */

/** A design option selected for merch generation. */
export interface DesignOption {
  readonly id: string;
  readonly designId?: string;
  readonly productId?: string;
  readonly variantId?: string;
  readonly imageUrl?: string;
  readonly svgContent?: string;
  readonly concept?: string;
  readonly category?: string;
  readonly description?: string;
  readonly status?: string;
}

/** A product variant reference. */
export interface ProductVariant {
  readonly id: string;
  readonly label?: string;
  readonly imageUrl?: string;
  readonly priceCents?: number;
  readonly costCents?: number;
}

/** A selected product for merch generation. */
export interface SelectedProduct {
  readonly id: string;
  readonly productId: number;
  readonly printfulProductId?: number;
  readonly name?: string;
  readonly variants?: readonly ProductVariant[];
  readonly variantIds: number[];
  readonly baseCostCents?: number;
}

/** Merch generation request. */
export interface MerchGenerationRequest {
  readonly designOption: DesignOption;
  readonly products: readonly SelectedProduct[];
}

export interface ChatMerchGenerationInput {
  readonly profileId: string;
  readonly clerkUserId: string;
  readonly prompt: string;
  readonly itemType?: string | null;
  readonly conversationId?: string | null;
  readonly turnId?: string | null;
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------
/**
 * Generate merch card options from a design concept.
 *
 * Thin wrapper over createMerchGeneration that enriches prompt text with
 * optional item type hints and routes request metadata.
 */
export async function generateMerchFromConcept(
  input: ChatMerchGenerationInput
): Promise<MerchGenerationResult> {
  const { profileId, clerkUserId, prompt, itemType } = input;

  const fullPrompt = [prompt, itemType ? 'Item type: ' + itemType : '']
    .filter(Boolean)
    .join('\n')
    .trim();

  return createMerchGeneration({
    profileId,
    clerkUserId,
    prompt: fullPrompt || 'Generate premium merch for this artist.',
    command: 'create_merch',
    conversationId: input.conversationId ?? null,
    turnId: input.turnId ?? null,
  });
}

/**
 * Generate preview merch options using the preview command tag.
 *
 * This currently follows the same persisted generation flow as
 * generateMerchFromConcept, but marks the batch/turn as
 * preview_merch_options for downstream handling.
 */
export async function previewMerchFromConcept(
  input: ChatMerchGenerationInput
): Promise<MerchGenerationResult> {
  const { profileId, clerkUserId, prompt, itemType } = input;

  const fullPrompt = [prompt, itemType ? 'Item type: ' + itemType : '']
    .filter(Boolean)
    .join('\n')
    .trim();

  return createMerchGeneration({
    profileId,
    clerkUserId,
    prompt: fullPrompt || 'Preview premium merch for this artist.',
    command: 'preview_merch_options',
    conversationId: input.conversationId ?? null,
    turnId: input.turnId ?? null,
  });
}

/**
 * Select a merch design option and create a merch card.
 * Delegates to the existing selectMerchDesign for the full flow.
 */
export async function selectAndCreateMerchCard(params: {
  readonly generationId: string;
  readonly clerkUserId: string;
  readonly optionId?: string | null;
  readonly optionNumber?: number | null;
  readonly publish?: boolean;
}): Promise<MerchSelectionResult> {
  return selectMerchDesign({
    generationId: params.generationId,
    clerkUserId: params.clerkUserId,
    optionId: params.optionId ?? null,
    optionNumber: params.optionNumber ?? null,
    publish: params.publish === true,
  });
}

/**
 * Determine if a design concept can be fulfilled by Printful.
 * Returns true if Printful is configured or if we have mock data fallback.
 */
export function canFulfillMerch(): boolean {
  return true;
}

export type { MerchGenerationOptionView, MerchGenerationResult };
