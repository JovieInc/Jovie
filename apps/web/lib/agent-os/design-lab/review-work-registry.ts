import {
  getMarketingRegistryEntry,
  type MarketingSectionRegistryEntry,
} from '@/data/marketing/componentRegistry';
import type { MarketingGenerationStage } from '@/data/marketing/generation';
import {
  getRequiredVariantInputs,
  getVariant,
  type MarketingSectionId,
} from '@/data/marketing/sections';

export const MARKETING_REVIEW_REGISTRY_STAGES = [
  'truth',
  'narrative',
  'copy',
  'section-design',
  'asset-generation',
  'adversarial-review',
] as const satisfies readonly MarketingGenerationStage[];

export type MarketingReviewRegistryStage =
  (typeof MARKETING_REVIEW_REGISTRY_STAGES)[number];

export type MarketingRegistryEligibilityStatus =
  | 'eligible'
  | 'omitted'
  | 'none-fits'
  | 'ineligible';

export type MarketingRegistryEligibilityCode =
  | 'registry-entry-missing'
  | 'registry-kind-mismatch'
  | 'registry-source-unresolved'
  | 'registry-recipe-unproven'
  | 'variant-required'
  | 'variant-missing'
  | 'variant-inactive'
  | 'variant-input-missing'
  | 'variant-input-unexpected';

export interface MarketingReviewRegistryTarget {
  readonly candidateId?: string;
  /** `null` represents an explicit omit/none choice. */
  readonly registryId: string | null;
  readonly stage: MarketingReviewRegistryStage;
  readonly variantId?: string | null;
  readonly providedInputs?: readonly string[];
  readonly allowOmit?: boolean;
  readonly allowNone?: boolean;
}

export interface MarketingRegistryEligibility {
  readonly candidateId: string | null;
  readonly registryId: string | null;
  readonly stage: MarketingReviewRegistryStage;
  readonly variantId: string | null;
  readonly status: MarketingRegistryEligibilityStatus;
  readonly code: MarketingRegistryEligibilityCode | null;
  readonly requiredInputs: readonly string[];
  readonly missingInputs: readonly string[];
  readonly summary: string;
  /** Only `ineligible` blocks model work. Omit/none-fits are valid choices. */
  readonly blocking: boolean;
}

const VARIANT_STAGES = new Set<MarketingReviewRegistryStage>([
  'section-design',
  'asset-generation',
  'adversarial-review',
]);

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right)
  );
}

function result(
  target: MarketingReviewRegistryTarget,
  input: Omit<
    MarketingRegistryEligibility,
    'candidateId' | 'registryId' | 'stage' | 'variantId'
  > & { readonly variantId?: string | null }
): MarketingRegistryEligibility {
  return {
    candidateId: target.candidateId?.trim() || null,
    registryId: target.registryId,
    stage: target.stage,
    variantId: input.variantId ?? target.variantId ?? null,
    ...input,
  };
}

function omitted(
  target: MarketingReviewRegistryTarget,
  summary: string
): MarketingRegistryEligibility {
  return result(target, {
    variantId: null,
    status: 'omitted',
    code: null,
    requiredInputs: [],
    missingInputs: [],
    summary,
    blocking: false,
  });
}

function noneFits(
  target: MarketingReviewRegistryTarget,
  summary: string
): MarketingRegistryEligibility {
  return result(target, {
    variantId: null,
    status: 'none-fits',
    code: null,
    requiredInputs: [],
    missingInputs: [],
    summary,
    blocking: false,
  });
}

function ineligible(
  target: MarketingReviewRegistryTarget,
  code: MarketingRegistryEligibilityCode,
  summary: string,
  variantId: string | null = target.variantId ?? null,
  requiredInputs: readonly string[] = [],
  missingInputs: readonly string[] = []
): MarketingRegistryEligibility {
  return result(target, {
    variantId,
    status: 'ineligible',
    code,
    requiredInputs,
    missingInputs,
    summary,
    blocking: true,
  });
}

function sectionEligibility(
  target: MarketingReviewRegistryTarget,
  entry: MarketingSectionRegistryEntry
): MarketingRegistryEligibility {
  const requestedVariant = target.variantId?.trim() || null;
  if (!requestedVariant) {
    return target.allowNone
      ? noneFits(
          target,
          `${entry.id}: no registered variant was selected; none fits is allowed.`
        )
      : ineligible(
          target,
          'variant-required',
          `${entry.id}: a registered active variant is required before model review.`
        );
  }

  if (!entry.variants.includes(requestedVariant)) {
    return target.allowNone
      ? noneFits(
          target,
          `${entry.id}/${requestedVariant}: variant is not registered; none fits is allowed.`
        )
      : ineligible(
          target,
          'variant-missing',
          `${entry.id}/${requestedVariant}: variant is not registered.`
        );
  }

  let variant: ReturnType<typeof getVariant>;
  try {
    variant = getVariant(
      entry.sectionId as MarketingSectionId,
      requestedVariant
    );
  } catch {
    variant = null;
  }
  if (!variant || variant.status !== 'active') {
    return target.allowOmit
      ? omitted(
          target,
          `${entry.id}/${requestedVariant}: variant is not active; omit is allowed.`
        )
      : target.allowNone
        ? noneFits(
            target,
            `${entry.id}/${requestedVariant}: variant is not active; none fits is allowed.`
          )
        : ineligible(
            target,
            'variant-inactive',
            `${entry.id}/${requestedVariant}: only active variants may enter model review.`
          );
  }

  const requiredInputs = sortedUnique(
    getRequiredVariantInputs(
      entry.sectionId as MarketingSectionId,
      requestedVariant
    )
  );
  const providedInputs = new Set(sortedUnique(target.providedInputs ?? []));
  const missingInputs = requiredInputs.filter(
    input => !providedInputs.has(input)
  );
  const unexpectedInputs = [...providedInputs].filter(
    input => !requiredInputs.includes(input)
  );
  if (missingInputs.length > 0) {
    if (target.allowOmit) {
      return omitted(
        target,
        `${entry.id}/${requestedVariant}: required inputs are missing; omit is allowed.`
      );
    }
    if (target.allowNone) {
      return noneFits(
        target,
        `${entry.id}/${requestedVariant}: required inputs are missing; none fits is allowed.`
      );
    }
    return ineligible(
      target,
      'variant-input-missing',
      `${entry.id}/${requestedVariant}: required variant inputs are missing.`,
      requestedVariant,
      requiredInputs,
      missingInputs
    );
  }
  if (unexpectedInputs.length > 0) {
    return ineligible(
      target,
      'variant-input-unexpected',
      `${entry.id}/${requestedVariant}: provided inputs are not in the canonical variant contract.`,
      requestedVariant,
      requiredInputs,
      []
    );
  }

  return result(target, {
    variantId: requestedVariant,
    status: 'eligible',
    code: null,
    requiredInputs,
    missingInputs: [],
    summary: `${entry.id}/${requestedVariant}: canonical active variant is eligible.`,
    blocking: false,
  });
}

/**
 * Validate one candidate against the canonical registry before any semantic
 * reviewer is called. This is deliberately narrow: it checks identity,
 * source/variant status, and required inputs. It does not certify a render.
 */
export function validateMarketingReviewRegistryTarget(
  target: MarketingReviewRegistryTarget
): MarketingRegistryEligibility {
  const registryId = target.registryId?.trim() || null;
  if (!registryId) {
    return target.allowOmit
      ? omitted(target, 'No registry identity selected; omission is allowed.')
      : target.allowNone
        ? noneFits(target, 'No registry identity fits this candidate.')
        : ineligible(
            target,
            'registry-entry-missing',
            'A canonical registry identity is required before model review.'
          );
  }

  const entry = getMarketingRegistryEntry(registryId);
  if (!entry) {
    return target.allowNone
      ? noneFits(
          target,
          `${registryId}: registry identity is unknown; none fits is allowed.`
        )
      : ineligible(
          target,
          'registry-entry-missing',
          `${registryId}: registry identity is not present in the canonical registry.`
        );
  }

  if (!entry.sourceBacked) {
    return target.allowOmit
      ? omitted(
          target,
          `${registryId}: source is unresolved; omission is allowed.`
        )
      : target.allowNone
        ? noneFits(
            target,
            `${registryId}: source is unresolved; none fits is allowed.`
          )
        : ineligible(
            target,
            'registry-source-unresolved',
            `${registryId}: source-backed registry evidence is unresolved.`
          );
  }

  if (entry.kind === 'recipe' && entry.status !== 'proven') {
    return target.allowOmit
      ? omitted(
          target,
          `${registryId}: recipe is not proven; omission is allowed.`
        )
      : target.allowNone
        ? noneFits(
            target,
            `${registryId}: recipe is not proven; none fits is allowed.`
          )
        : ineligible(
            target,
            'registry-recipe-unproven',
            `${registryId}: only proven recipes may enter model review.`
          );
  }

  if (VARIANT_STAGES.has(target.stage)) {
    if (entry.kind !== 'section') {
      return ineligible(
        target,
        'registry-kind-mismatch',
        `${registryId}: ${target.stage} requires a registered section variant.`
      );
    }
    return sectionEligibility(target, entry);
  }

  if (target.variantId) {
    return ineligible(
      target,
      'registry-kind-mismatch',
      `${registryId}: ${target.stage} does not accept a variant selector.`
    );
  }

  return result(target, {
    variantId: null,
    status: 'eligible',
    code: null,
    requiredInputs: [],
    missingInputs: [],
    summary: `${registryId}: canonical registry identity is eligible for ${target.stage}.`,
    blocking: false,
  });
}

export function validateMarketingReviewRegistryTargets(
  targets: readonly MarketingReviewRegistryTarget[]
): readonly MarketingRegistryEligibility[] {
  return targets.map(validateMarketingReviewRegistryTarget);
}

export function isMarketingReviewRegistryStage(
  value: string
): value is MarketingReviewRegistryStage {
  return (MARKETING_REVIEW_REGISTRY_STAGES as readonly string[]).includes(
    value
  );
}
