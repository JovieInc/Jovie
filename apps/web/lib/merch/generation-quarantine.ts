import 'server-only';

import { db } from '@/lib/db';
import { merchDesignOptions } from '@/lib/db/schema/merch';
import type { MerchCatalogSelection } from './catalog';
import {
  MERCH_PERSON_CONTENT_PUBLISH_BLOCKER,
  type MerchContentReview,
  stampMerchContentReview,
} from './content-contract';
import {
  MERCH_CANONICAL_PIPELINE_ID,
  MERCH_GENERATION_CONTRACT_VERSION,
} from './generation-contract';

/** Retain unrendered concepts as review anchors in the existing option/QA tables. */
export async function persistUnrenderedMerchOption(params: {
  readonly generationId: string;
  readonly profileId: string;
  readonly catalog: Omit<
    MerchCatalogSelection,
    'availabilityRegion' | 'shippingProfile' | 'providerWarnings'
  >;
  readonly grossMargin: number;
  readonly catalogWarnings: readonly string[];
  readonly optionId: string;
  readonly optionNumber: number;
  readonly designName: string;
  readonly concept: string;
  readonly review?: MerchContentReview;
  readonly conceptReview: Record<string, unknown>;
}) {
  const { catalog, review } = params;
  const pricing = catalog.pricing;
  const reasons = review
    ? [...review.failureCodes]
    : (params.conceptReview.reasons as string[]);
  const explanation = review
    ? MERCH_PERSON_CONTENT_PUBLISH_BLOCKER
    : 'Concept review required before artwork generation.';
  await db.insert(merchDesignOptions).values({
    id: params.optionId,
    generationBatchId: params.generationId,
    creatorProfileId: params.profileId,
    optionNumber: params.optionNumber,
    status: review ? 'rejected' : 'quarantined',
    designLane: 'fashion_graphic_item',
    designName: params.designName,
    productType: catalog.productType,
    printfulProductName: catalog.productName,
    printfulCatalogProductId: catalog.catalogProductId,
    printfulCatalogVariantIds: catalog.catalogVariantIds,
    variantMap: catalog.variantMap,
    colorway: catalog.colorway,
    availableSizes: catalog.sizes,
    placements: catalog.placements,
    technique: catalog.technique,
    retailPriceCents: pricing.retailPriceCents,
    estimatedPrintfulProductCostCents:
      pricing.estimatedPrintfulProductCostCents,
    estimatedShippingCostCents: pricing.estimatedShippingCostCents,
    estimatedGrossMarginCents: params.grossMargin,
    artistShareCents: pricing.artistPayoutPerUnitEstimateCents,
    jovieShareCents: pricing.jovieMarginPerUnitEstimateCents,
    pricing,
    concept: params.concept,
    whyItFits: explanation,
    mockupUrls: [],
    printFileUrls: [],
    productionWarnings: [...params.catalogWarnings, explanation],
    qualityReview: {
      copyrightRisk: 'unknown',
      typography: 'not_rendered',
      printFeasible: false,
      contractVersion: MERCH_GENERATION_CONTRACT_VERSION,
      pipeline: MERCH_CANONICAL_PIPELINE_ID,
      conceptReview: params.conceptReview,
      ...(review ? stampMerchContentReview(review) : {}),
    },
    learning: {
      styleLane: 'fashion_graphic_item',
      typographyStyle: 'unrendered',
      graphicDensity: 'minimal',
      garmentColor: catalog.colorway,
      motifs: [],
      selectedOverOptionIds: [],
      rejectedAttributes: reasons,
    },
  });
}
