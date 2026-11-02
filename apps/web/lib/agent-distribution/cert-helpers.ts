/** Pure helpers for the agent-path certification harness (scripts/agent-path-cert.ts). */

/** MCP Streamable HTTP may answer JSON or SSE; return the JSON-RPC document either way. */
export function parseMcpBody(raw: string): Record<string, unknown> {
  const text = raw.trim();
  let payload = text;
  if (/^(event:|data:)/m.test(text)) {
    const data = text
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim());
    // A multi-event stream: the last JSON-RPC message with a result/error wins.
    payload = data.length > 1 ? (data.at(-1) ?? '') : (data[0] ?? '');
  }
  try {
    const doc = JSON.parse(payload);
    return doc && typeof doc === 'object' ? doc : { _raw: text.slice(0, 500) };
  } catch {
    return { _raw: text.slice(0, 500) };
  }
}

/** Depth-first search for the first non-empty value under any of `keys`. */
export function findKey(value: unknown, keys: readonly string[]): unknown {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findKey(entry, keys);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys)
      if (
        record[key] !== undefined &&
        record[key] !== null &&
        record[key] !== ''
      )
        return record[key];
    for (const entry of Object.values(record)) {
      const found = findKey(entry, keys);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function percentile(
  values: readonly number[],
  p: number
): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)] ?? null;
}

export function latencyByTool(
  calls: readonly { tool: string; ms: number }[]
): Record<string, { count: number; p50: number | null; p95: number | null }> {
  const grouped = new Map<string, number[]>();
  for (const call of calls)
    grouped.set(call.tool, [...(grouped.get(call.tool) ?? []), call.ms]);
  return Object.fromEntries(
    [...grouped].map(([tool, ms]) => [
      tool,
      { count: ms.length, p50: percentile(ms, 50), p95: percentile(ms, 95) },
    ])
  );
}

/** Rate limiting is infrastructure, not a verdict on the change. */
export function isRateLimited(
  status: number,
  doc: Record<string, unknown>
): boolean {
  if (status === 429) return true;
  const structured = findKey(doc, ['error', 'code']);
  return structured === 'RATE_LIMITED';
}

export function toolErrorMessage(doc: Record<string, unknown>): string | null {
  const error = doc.error as { message?: string } | undefined;
  return error?.message ?? null;
}
