import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { calendarEnrichmentPipeline } from './pipelines/calendar';
import { gmailEnrichmentPipeline } from './pipelines/gmail';
import type {
  ConnectorEnrichmentPipeline,
  ConnectorEnrichmentProviderId,
} from './types';

/**
 * Per-connector enrichment pipelines (JOV-3114).
 * Apple Photos is deferred — add `apple_photos` here when JOV-2919 lands.
 */
export const CONNECTOR_ENRICHMENT_PIPELINES = {
  [CONNECTOR_PROVIDERS.gmail]: gmailEnrichmentPipeline,
  [CONNECTOR_PROVIDERS.google_calendar]: calendarEnrichmentPipeline,
} as const satisfies Record<
  ConnectorEnrichmentProviderId,
  ConnectorEnrichmentPipeline
>;

export const CONNECTOR_ENRICHMENT_PIPELINE_ORDER: readonly ConnectorEnrichmentProviderId[] =
  [CONNECTOR_PROVIDERS.gmail, CONNECTOR_PROVIDERS.google_calendar];

export function getConnectorEnrichmentPipeline(
  provider: ConnectorEnrichmentProviderId
): ConnectorEnrichmentPipeline {
  return CONNECTOR_ENRICHMENT_PIPELINES[provider];
}
