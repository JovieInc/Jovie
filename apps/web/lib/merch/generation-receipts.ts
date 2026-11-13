import 'server-only';

import { logger } from '@/lib/utils/logger';
import type { MerchCatalogSelection } from './catalog';
import {
  MERCH_CANONICAL_PIPELINE_ID,
  MERCH_GENERATION_CONTRACT_VERSION,
  type MerchGenerationReceipt,
} from './generation-contract';
import type { MerchGenerationFailureSummary } from './generation-failures';
import { scheduleMerchMockupEnrichment } from './mockup-enrichment';

export function logMerchGenerationReceipt(
  receipt: MerchGenerationReceipt
): void {
  logger.info('[merch-generation] production receipt', { ...receipt });
}

/**
 * Schedules durable, observable Printful mockup enrichment for the generated
 * designs (JOV-4743). Each option stays `pending_mockup` until the truthful
 * product mockup is attached (`mockup_ready`) or the retry budget/timeout is
 * exhausted (`mockup_failed`, which blocks publish). Replaces the previous
 * untracked fire-and-forget `Promise.allSettled` path.
 */
export function schedulePrintfulMockupEnrichment(params: {
  readonly generationId: string;
  readonly profileId: string;
  readonly startedAt: number;
  readonly requestedDesignCount: number;
  readonly contentReviews: MerchGenerationReceipt['contentReviews'];
  readonly failureSummary: MerchGenerationFailureSummary;
  readonly designs: readonly {
    readonly optionId: string;
    readonly printFileUrl: string;
    /** The option's OWN resolved catalog — mockups render on the option's product, never the default tee. */
    readonly catalogProductId: number;
    readonly catalogVariantIds: readonly number[];
    readonly placements: readonly string[];
    readonly technique: MerchCatalogSelection['technique'];
    readonly productType: string;
  }[];
}): void {
  scheduleMerchMockupEnrichment(
    params.designs.map(
      ({
        optionId,
        printFileUrl,
        catalogProductId,
        catalogVariantIds,
        placements,
        technique,
        productType,
      }) => ({
        optionId,
        request: {
          printFileUrl,
          catalogProductId,
          catalogVariantIds,
          placements,
          technique,
          productTypes: [productType],
        },
      })
    ),
    outcomes => {
      logMerchGenerationReceipt({
        pipeline: MERCH_CANONICAL_PIPELINE_ID,
        contractVersion: MERCH_GENERATION_CONTRACT_VERSION,
        generationId: params.generationId,
        profileId: params.profileId,
        requestedDesignCount: params.requestedDesignCount,
        readyDesignCount: params.designs.length,
        mockups: outcomes,
        contentReviews: params.contentReviews,
        failureSummary: params.failureSummary,
        disposition: 'ready',
        durationMs: Date.now() - params.startedAt,
      });
    }
  );
}
