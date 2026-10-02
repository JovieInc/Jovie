/**
 * Capture adapter for the marketing factory (JOV-7250).
 *
 * Resolves a media sourcing decision against the screenshot registry: a
 * registered marketing-export scenario resolves to its published image; any
 * other capture becomes a queued request for lib/screenshots/registry.ts and
 * the screenshots.yml workflow. It never renders or generates product UI.
 */

import type { FactoryMediaSourcing } from '@/data/marketing/factory/mediaDecision';
import {
  getMarketingExportImage,
  getScreenshotScenario,
  type MarketingExportImage,
} from '@/lib/screenshots/registry';

export const CAPTURE_REQUEST_SCHEMA =
  'jovie.factory-capture-request/v1' as const;

export interface CaptureRegistry {
  readonly getScenario: (
    id: string
  ) => { readonly consumers: readonly string[] } | null;
  readonly getExportImage: (id: string) => MarketingExportImage;
}

export const DEFAULT_CAPTURE_REGISTRY: CaptureRegistry = {
  getScenario: getScreenshotScenario,
  getExportImage: getMarketingExportImage,
};

export interface CaptureScenarioRequest {
  readonly schema: typeof CAPTURE_REQUEST_SCHEMA;
  readonly pageId: string;
  readonly sectionInstanceId: string;
  readonly scenarioId: string | null;
  readonly reason: string;
  readonly registryPath: 'apps/web/lib/screenshots/registry.ts';
  readonly workflow: 'screenshots.yml';
}

export type CaptureAdapterResult =
  | {
      readonly status: 'resolved';
      readonly scenarioId: string;
      readonly image: MarketingExportImage;
    }
  | { readonly status: 'queued'; readonly request: CaptureScenarioRequest };

/** Registered means the scenario exists and is tagged for marketing export. */
export function isRegisteredMarketingCapture(
  scenarioId: string,
  registry: CaptureRegistry = DEFAULT_CAPTURE_REGISTRY
): boolean {
  return (
    registry.getScenario(scenarioId)?.consumers.includes('marketing-export') ??
    false
  );
}

export function resolveCapture(
  input: {
    readonly pageId: string;
    readonly sectionInstanceId: string;
    readonly sourcing: Extract<
      FactoryMediaSourcing,
      { kind: 'registry-capture' | 'capture-request' }
    >;
  },
  registry: CaptureRegistry = DEFAULT_CAPTURE_REGISTRY
): CaptureAdapterResult {
  const { sourcing } = input;
  const queue = (scenarioId: string | null, reason: string) => ({
    status: 'queued' as const,
    request: {
      schema: CAPTURE_REQUEST_SCHEMA,
      pageId: input.pageId,
      sectionInstanceId: input.sectionInstanceId,
      scenarioId,
      reason,
      registryPath: 'apps/web/lib/screenshots/registry.ts' as const,
      workflow: 'screenshots.yml' as const,
    },
  });

  if (sourcing.kind === 'capture-request') {
    return queue(sourcing.scenarioId, sourcing.reason);
  }
  if (!isRegisteredMarketingCapture(sourcing.scenarioId, registry)) {
    return queue(
      sourcing.scenarioId,
      `Scenario ${sourcing.scenarioId} is not tagged marketing-export.`
    );
  }
  try {
    return {
      status: 'resolved',
      scenarioId: sourcing.scenarioId,
      image: registry.getExportImage(sourcing.scenarioId),
    };
  } catch (error) {
    return queue(
      sourcing.scenarioId,
      error instanceof Error ? error.message : String(error)
    );
  }
}
