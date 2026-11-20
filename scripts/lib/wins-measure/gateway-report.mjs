// Measure a Gateway report feature tag (requests or spend over N days).
import { fetchRows, summarize } from '../../ai-gateway-report.mjs';

/**
 * @param {{ feature: string, field: 'requests' | 'costUsd' }} spec
 * @param {{ apiKey?: string, days?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ value: number, evidence: string }>}
 */
export async function measureGatewayReport(spec, opts = {}) {
  const apiKey = opts.apiKey ?? process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error('gateway-report: AI_GATEWAY_API_KEY is not set');
  const days = opts.days ?? 7;
  const rows = summarize(
    await fetchRows('tag', days, apiKey, opts.fetchImpl ?? fetch),
    days
  );
  const row = rows.find(r => r.key === spec.feature);
  if (!row)
    throw new Error(
      `gateway-report: no tag row for feature:${spec.feature} in last ${days}d`
    );
  const value = row[spec.field];
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(
      `gateway-report feature:${spec.feature}.${spec.field}: not a number`
    );
  return {
    value,
    evidence: `ai-gateway-report tag:${spec.feature} ${spec.field} ${days}d`,
  };
}
