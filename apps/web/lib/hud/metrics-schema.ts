import type { FetchResponseSchema } from '@/lib/queries/fetch';
import type { HudMetrics } from '@/types/hud';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REQUIRED_RECORD_FIELDS = [
  'branding',
  'overview',
  'operations',
  'reliability',
  'testing',
  'deployments',
  'aiOps',
  'sources',
] as const;

/**
 * Structural validation for the /api/hud/metrics domain response.
 *
 * This is intentionally a shape check (not a full deep schema): it rejects
 * error envelopes and malformed payloads before they reach the Query cache
 * or the HUD renderers, while allowing additive metric fields to evolve.
 */
export function parseHudMetrics(data: unknown): HudMetrics {
  if (!isRecord(data)) {
    throw new Error('HUD metrics payload is not an object');
  }
  if (typeof data.generatedAtIso !== 'string') {
    throw new Error('HUD metrics payload is missing generatedAtIso');
  }
  if (data.accessMode !== 'admin' && data.accessMode !== 'kiosk') {
    throw new Error('HUD metrics payload has an invalid accessMode');
  }
  for (const field of REQUIRED_RECORD_FIELDS) {
    if (!isRecord(data[field])) {
      throw new Error(`HUD metrics payload is missing ${field}`);
    }
  }
  if (!Array.isArray(data.agentRuns)) {
    throw new Error('HUD metrics payload is missing agentRuns');
  }
  return data as unknown as HudMetrics;
}

export const hudMetricsResponseSchema: FetchResponseSchema<HudMetrics> = {
  parse: parseHudMetrics,
};
