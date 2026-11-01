/** Validate evidence, including legacy cache entries; transport success is insufficient. */
import type { ResearchResult } from './types.ts';

export function verifyResearchResult(
  result: Omit<ResearchResult, 'verdict' | 'reasons'>
): ResearchResult {
  const reasons: string[] = [];
  const external = result.hits.filter(
    h =>
      h.source !== 'gbrain' && h.source !== 'repo' && /^https?:\/\//.test(h.url)
  );
  if (!external.length) reasons.push('no external sources');
  if (!result.runs.some(r => r.tier > 0))
    reasons.push('external providers not run');
  for (const run of result.runs) {
    // A working backup judge satisfies relevance verification.
    if (run.tier < 0 && result.judge.model) continue;
    if (!run.ok && run.skipped !== 'not applicable') {
      reasons.push(
        `${run.source}: ${run.skipped ?? run.error ?? 'unavailable'}`
      );
    }
  }
  if (!result.judge.model) reasons.push('relevance judge unavailable');
  return {
    ...result,
    verdict: reasons.length ? 'degraded' : 'ok',
    reasons: [...new Set(reasons)],
  };
}
