/**
 * Merch / drop creation workflow (JOV-2209).
 *
 * Draft-first drop records with typed lifecycle transitions and idempotent
 * product-page keys. No live payment behavior.
 */

import type {
  CampaignOption,
  DropLifecycleState,
  DropRecord,
  DropTransitionResult,
} from './types';

const ALLOWED_TRANSITIONS: Readonly<
  Record<DropLifecycleState, readonly DropLifecycleState[]>
> = Object.freeze({
  draft: Object.freeze(['preview_ready', 'cancelled'] as const),
  preview_ready: Object.freeze(['scheduled', 'draft', 'cancelled'] as const),
  scheduled: Object.freeze(['live', 'cancelled'] as const),
  live: Object.freeze(['ended', 'cancelled'] as const),
  ended: Object.freeze([] as const),
  cancelled: Object.freeze([] as const),
});

function slugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/(^-|-$)/g, '');
}

/** Stable product page key for idempotent draft creation. */
export function buildProductPageKey(input: {
  readonly ownerProfileId: string;
  readonly campaignId: string;
  readonly productSku: string;
}): string {
  return [
    slugPart(input.ownerProfileId) || 'owner',
    slugPart(input.campaignId) || 'campaign',
    slugPart(input.productSku) || 'sku',
  ].join('/');
}

export function createDraftDrop(input: {
  readonly id: string;
  readonly campaignId: string;
  readonly ownerProfileId: string;
  readonly option: CampaignOption;
  readonly launchStartsAt: string;
  readonly launchEndsAt: string;
  readonly inventoryMode?: 'unlimited' | 'limited';
  readonly inventoryCount?: number | null;
  readonly fulfillment?: DropRecord['fulfillment'];
  readonly artworkAssetId?: string | null;
}): DropRecord {
  const productPageKey = buildProductPageKey({
    ownerProfileId: input.ownerProfileId,
    campaignId: input.campaignId,
    productSku: input.option.productSku,
  });

  return {
    id: input.id,
    campaignId: input.campaignId,
    ownerProfileId: input.ownerProfileId,
    productSku: input.option.productSku,
    productLabel: input.option.productLabel,
    priceCents: input.option.unitPriceCents,
    inventoryMode: input.inventoryMode ?? 'unlimited',
    inventoryCount:
      input.inventoryMode === 'limited' ? (input.inventoryCount ?? 0) : null,
    fulfillment: input.fulfillment ?? 'print_on_demand',
    artworkAssetId: input.artworkAssetId ?? null,
    launchStartsAt: input.launchStartsAt,
    launchEndsAt: input.launchEndsAt,
    state: 'draft',
    productPageKey,
    previewUrl: null,
  };
}

/**
 * Idempotent create: if an existing drop matches productPageKey, return it.
 */
export function upsertDraftDrop(
  existing: readonly DropRecord[],
  input: Parameters<typeof createDraftDrop>[0]
): { readonly drop: DropRecord; readonly created: boolean } {
  const key = buildProductPageKey({
    ownerProfileId: input.ownerProfileId,
    campaignId: input.campaignId,
    productSku: input.option.productSku,
  });
  const found = existing.find(d => d.productPageKey === key);
  if (found) {
    return { drop: found, created: false };
  }
  return { drop: createDraftDrop(input), created: true };
}

export function canTransitionDrop(
  from: DropLifecycleState,
  to: DropLifecycleState
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionDrop(
  drop: DropRecord,
  to: DropLifecycleState,
  options: { readonly previewUrl?: string | null } = {}
): DropTransitionResult {
  if (!canTransitionDrop(drop.state, to)) {
    return {
      drop,
      previousState: drop.state,
      allowed: false,
      reason: `Cannot transition drop from ${drop.state} to ${to}`,
    };
  }

  const next: DropRecord = {
    ...drop,
    state: to,
    previewUrl:
      to === 'preview_ready'
        ? (options.previewUrl ?? `/drop/preview/${drop.productPageKey}`)
        : drop.previewUrl,
  };

  return {
    drop: next,
    previousState: drop.state,
    allowed: true,
  };
}

export function isDropVisibleInCampaignStatus(drop: DropRecord): boolean {
  return drop.state !== 'cancelled';
}
