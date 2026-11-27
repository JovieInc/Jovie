// Classify a win metric as machine-queryable (v1 adapters) or needs-probe.
// v1 only auto-measures stable in-repo JSON and the Gateway spend report.
// Fragile HTML/API scrapers are explicit skips.

const JSON_FILE =
  /(?:^|[|\s])((?:docs\/)?metrics\/[\w./-]+\.json)(?:#([\w.[\]]+))?/i;
const GATEWAY_FEATURE = /Gateway report\s+feature:(\S+)/i;

/** @typedef {'json-file' | 'gateway-report' | 'needs-probe'} AdapterKind */

/**
 * @param {{ source?: string, query?: string, name?: string, unit?: string }} metric
 * @returns {{ adapter: AdapterKind, file?: string, path?: string, feature?: string, field?: 'requests' | 'costUsd' }}
 */
export function classifyMetric(metric) {
  const source = metric?.source ?? '';
  const query = metric?.query ?? '';
  const blob = `${source} ${query}`;

  const gw = source.match(GATEWAY_FEATURE) ?? blob.match(GATEWAY_FEATURE);
  if (gw && /ai-gateway-report/i.test(query || source)) {
    const name = `${metric?.name ?? ''} ${metric?.unit ?? ''}`.toLowerCase();
    const field =
      /\b(usd|spend|cost)\b/.test(name) || metric?.unit === 'usd'
        ? 'costUsd'
        : 'requests';
    return { adapter: 'gateway-report', feature: gw[1], field };
  }

  const fromBlob = blob.match(JSON_FILE);
  if (fromBlob) {
    const file = fromBlob[1].startsWith('docs/')
      ? fromBlob[1]
      : `docs/${fromBlob[1]}`;
    const path =
      fromBlob[2] ||
      (query.includes('#')
        ? query.split('#').pop()?.trim()
        : /^[\w.[\]]+$/.test(query.trim())
          ? query.trim()
          : '');
    if (path) return { adapter: 'json-file', file, path };
  }

  // Source is a JSON metrics file; query is the dotted field path.
  if (/\.json$/i.test(source.trim()) && /^[\w.[\]]+$/.test(query.trim())) {
    const file = source.trim().startsWith('docs/')
      ? source.trim()
      : source.trim().startsWith('metrics/')
        ? `docs/${source.trim()}`
        : source.trim();
    return { adapter: 'json-file', file, path: query.trim() };
  }

  return { adapter: 'needs-probe' };
}

/** True when every measured metric on the win has a v1 adapter. */
export function isQueryableWin(win) {
  const metrics = (win?.metrics ?? []).filter(m => m.before !== null);
  if (!metrics.length) return false;
  return metrics.every(m => classifyMetric(m).adapter !== 'needs-probe');
}

/** True when the win is due and no metric is machine-queryable in v1. */
export function isNeedsProbeWin(win) {
  const metrics = (win?.metrics ?? []).filter(m => m.before !== null);
  if (!metrics.length) return false;
  return metrics.every(m => classifyMetric(m).adapter === 'needs-probe');
}
