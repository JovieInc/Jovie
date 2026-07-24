import 'server-only';

import { isMissingConnectorSchemaError } from '@/lib/connectors/schema-errors';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';
import { CONNECTOR_ENRICHMENT_PIPELINE_ORDER } from './registry';
import { resolveConnectorEnrichmentContext } from './scope';
import type { ConnectorEnrichmentRunResult } from './types';

const EMPTY_RESULT: ConnectorEnrichmentRunResult = {
  pipelines: [],
  totalSuggestionsCreated: 0,
};

/**
 * Runs all registered connector enrichment pipelines for a user.
 * Turns synced external_objects into context_facts + memory graph observations.
 */
export async function runConnectorEnrichment(
  userId: string
): Promise<ConnectorEnrichmentRunResult> {
  try {
    const context = await resolveConnectorEnrichmentContext(userId);
    if (!context) {
      logger.info('[connector-enrichment] Skipping — no connected scope', {
        userId,
      });
      return EMPTY_RESULT;
    }

    const pipelines = [];
    let totalSuggestionsCreated = 0;

    for (const provider of CONNECTOR_ENRICHMENT_PIPELINE_ORDER) {
      const accountId =
        provider === 'gmail'
          ? context.gmailAccountId
          : context.calendarAccountId;
      if (!accountId) continue;

      const { getConnectorEnrichmentPipeline } = await import('./registry');
      const pipeline = getConnectorEnrichmentPipeline(provider);
      const result = await pipeline.run(context);
      pipelines.push(result);
      totalSuggestionsCreated += result.suggestionsCreated;
    }

    logger.info('[connector-enrichment] Run complete', {
      userId,
      pipelineCount: pipelines.length,
      totalSuggestionsCreated,
    });

    return { pipelines, totalSuggestionsCreated };
  } catch (error) {
    if (isMissingConnectorSchemaError(error)) {
      logger.warn(
        '[connector-enrichment] Connector schema not migrated; skipping run',
        { userId }
      );
      return EMPTY_RESULT;
    }

    await captureError('Connector enrichment run failed', error, { userId });
    throw error;
  }
}
