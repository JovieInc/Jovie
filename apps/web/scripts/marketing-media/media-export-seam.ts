/**
 * Wires generated media behind the mediaExport.ts seam (JOV-7250).
 *
 * `executeMarketingMediaExportRequest` takes a synchronous `produceOutput`
 * and makes no provider call of its own (JOV-6232). Generation is async, so
 * it runs first; this module turns its results into that callback. Only a
 * `generated` result (art evaluator passed, provenance written) becomes an
 * ok output; everything else is a typed failure, so the export contract's
 * carry-forward and approval rules apply unchanged.
 */

import type {
  MarketingMediaExportOutputProfile,
  MarketingMediaExportOutputResult,
} from '@/data/marketing/mediaExport';
import type { MarketingImageResult } from './generate-image';

export function toMediaExportOutputResult(
  result: MarketingImageResult | undefined
): MarketingMediaExportOutputResult {
  if (!result || result.status === 'credentials-unavailable') {
    return { ok: false, code: 'output-provider-unavailable' };
  }
  if (result.status !== 'generated') {
    return { ok: false, code: 'output-render-failed' };
  }
  const { sidecar } = result;
  return {
    ok: true,
    assetHash: `sha256:${sidecar.sha256}`,
    width: result.width,
    height: result.height,
    format: result.mime,
    rightsProvenance: [
      'ai-generated',
      `provider=${sidecar.generator.provider}`,
      `model=${sidecar.generator.model}`,
      `c2pa=${sidecar.c2pa.status === 'embedded' ? 'embedded' : 'sidecar-only'}`,
      `sidecar=${result.sidecarPath}`,
    ].join(';'),
  };
}

export function createGeneratedProduceOutput(
  results: Partial<
    Record<MarketingMediaExportOutputProfile, MarketingImageResult>
  >
): (
  profile: MarketingMediaExportOutputProfile
) => MarketingMediaExportOutputResult {
  return profile => toMediaExportOutputResult(results[profile]);
}
