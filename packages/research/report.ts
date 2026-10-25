/** Human/agent-facing renderings. Bounded on purpose: research output is context cost. */
import type { ResearchState } from './state.ts';
import { type ResearchResult, SOURCES } from './types.ts';

export function renderResult(r: ResearchResult, maxHits = 8): string {
  const sources =
    [
      ...new Set(r.runs.filter(x => x.ok && x.hits > 0).map(x => x.source)),
    ].join('+') || 'none';
  const lines = [
    `research ${r.key} | cache=${r.cache} tier=${r.stoppedAtTier} sources=${sources} judge=${r.judge.model ?? 'none'} usd=${r.usd.toFixed(4)} ms=${r.ms} valid-until=${r.expiresAt.slice(0, 10)}${r.gbrainSlug ? ` page=${r.gbrainSlug}` : ''}`,
  ];
  if (r.priorDecisions.length) {
    lines.push('PRIOR DECISIONS (read before acting; do not silently undo):');
    for (const d of r.priorDecisions) lines.push(`  - ${d.slug}: ${d.title}`);
  }
  if (r.answer) lines.push('ANSWER:', r.answer.trim().slice(0, 1500));
  r.hits.slice(0, maxHits).forEach((h, i) => {
    const score = h.score === undefined ? '' : ` [${h.score.toFixed(1)}]`;
    lines.push(
      `${i + 1}.${score} ${h.title} <${h.url}> (${h.source}${h.publishedAt ? `, ${h.publishedAt.slice(0, 10)}` : ''})`
    );
    if (h.snippet) lines.push(`   ${h.snippet.slice(0, 240)}`);
  });
  if (r.hits.length === 0)
    lines.push('No relevant results. Consider --mode deep or rephrasing.');
  const skipped = r.runs
    .filter(x => x.skipped || x.error)
    .map(x => `${x.source}:${x.skipped ?? x.error}`);
  if (skipped.length) lines.push(`skipped: ${skipped.join('; ')}`);
  return lines.join('\n');
}

export async function sourcesTable(
  state: ResearchState,
  available: Record<string, boolean>
): Promise<string> {
  const usage = await state.readUsage();
  const day = new Date().toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const lines = [
    'source | tier | billing | ready | today calls/usd | month calls/usd | caps',
  ];
  for (const [name, spec] of Object.entries(SOURCES.sources)) {
    const u = usage.sources[name];
    const d = u?.day.key === day ? u.day : { calls: 0, usd: 0 };
    const m = u?.month.key === month ? u.month : { calls: 0, usd: 0 };
    const caps = spec.caps
      ? Object.entries(spec.caps)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ')
      : '-';
    lines.push(
      `${name} | ${spec.tier < 0 ? 'judge' : spec.tier} | ${spec.billing} | ${available[name] ?? '?'} | ${d.calls}/${d.usd.toFixed(3)} | ${m.calls}/${m.usd.toFixed(3)} | ${caps}`
    );
  }
  return lines.join('\n');
}
