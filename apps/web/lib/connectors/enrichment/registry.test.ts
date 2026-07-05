import { describe, expect, it } from 'vitest';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { APPLE_PHOTOS_ENRICHMENT_DEFERRED } from './photos';
import {
  CONNECTOR_ENRICHMENT_PIPELINE_ORDER,
  CONNECTOR_ENRICHMENT_PIPELINES,
  getConnectorEnrichmentPipeline,
} from './registry';

describe('connector enrichment registry (JOV-3114)', () => {
  it('registers gmail and google_calendar pipelines in stable order', () => {
    expect(CONNECTOR_ENRICHMENT_PIPELINE_ORDER).toEqual([
      CONNECTOR_PROVIDERS.gmail,
      CONNECTOR_PROVIDERS.google_calendar,
    ]);
    expect(Object.keys(CONNECTOR_ENRICHMENT_PIPELINES)).toEqual(
      CONNECTOR_ENRICHMENT_PIPELINE_ORDER
    );
  });

  it('returns pipeline executors by provider id', () => {
    const gmail = getConnectorEnrichmentPipeline(CONNECTOR_PROVIDERS.gmail);
    const calendar = getConnectorEnrichmentPipeline(
      CONNECTOR_PROVIDERS.google_calendar
    );

    expect(gmail.provider).toBe(CONNECTOR_PROVIDERS.gmail);
    expect(calendar.provider).toBe(CONNECTOR_PROVIDERS.google_calendar);
    expect(typeof gmail.run).toBe('function');
    expect(typeof calendar.run).toBe('function');
  });

  it('keeps Apple Photos enrichment explicitly deferred', () => {
    expect(APPLE_PHOTOS_ENRICHMENT_DEFERRED).toBe(true);
    expect(CONNECTOR_ENRICHMENT_PIPELINE_ORDER).not.toContain('apple_photos');
  });
});
