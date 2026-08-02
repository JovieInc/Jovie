export const DEFAULT_MERCH_ITEM_TYPE = 'premium tee';

/**
 * Generation either uses the stated product or transparently defaults once.
 * This keeps a running generation from competing with a product-type question.
 */
export function buildMerchGenerationPrompt(
  prompt: string | undefined,
  itemType: string | undefined,
  fallbackPrompt: string
): { readonly prompt: string; readonly usedDefaultItemType: boolean } {
  const resolvedItemType = itemType?.trim() || DEFAULT_MERCH_ITEM_TYPE;
  return {
    prompt: [prompt?.trim() || fallbackPrompt, `Item type: ${resolvedItemType}`]
      .filter(Boolean)
      .join('\n'),
    usedDefaultItemType: !itemType?.trim(),
  };
}
