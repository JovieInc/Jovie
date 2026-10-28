/** Research results as gbrain pages, so every later agent can reuse them. */
import type { GbrainClient } from './gbrain.ts';
import { normalizeQuery } from './normalize.ts';
import type { ResearchResult } from './types.ts';

export const researchSlug = (key: string) => `research/q-${key}`;

const yaml = (value: string) => JSON.stringify(value);
const RESULT_FENCE = 'research-result';

export function researchPage(
  result: ResearchResult,
  caller = 'unknown'
): string {
  const sources = [
    ...new Set(result.runs.filter(r => r.ok && r.hits > 0).map(r => r.source)),
  ];
  const lines = [
    '---',
    'type: research',
    `title: ${yaml(`Research: ${result.query}`.slice(0, 180))}`,
    `query: ${yaml(result.query)}`,
    `normalized: ${yaml(normalizeQuery(result.query))}`,
    `key: ${result.key}`,
    `freshness: ${result.freshness}`,
    `mode: ${result.mode}`,
    `created_at: ${result.createdAt}`,
    `expires_at: ${result.expiresAt}`,
    `sources: [${sources.join(', ')}]`,
    `usd: ${result.usd.toFixed(5)}`,
    `judge: ${result.judge.model ?? 'none'}`,
    `caller: ${yaml(caller)}`,
    'tags: [research]',
    '---',
    '',
    `# Research: ${result.query}`,
    '',
    `Researched ${result.createdAt.slice(0, 10)} by \`jovie-research\` (${result.mode}, freshness ${result.freshness}, stopped at tier ${result.stoppedAtTier}). Valid until ${result.expiresAt.slice(0, 10)}; after that, re-run rather than trust it.`,
    '',
  ];
  if (result.answer) lines.push('## Answer', '', result.answer.trim(), '');
  if (result.priorDecisions.length) {
    lines.push('## Related decisions', '');
    for (const d of result.priorDecisions)
      lines.push(`- [[${d.slug}]] ${d.title}`);
    lines.push('');
  }
  lines.push('## Sources', '');
  result.hits.forEach((h, i) => {
    const meta = [h.source, h.publishedAt?.slice(0, 10), h.score?.toFixed(2)]
      .filter(Boolean)
      .join(', ');
    lines.push(
      `${i + 1}. [${h.title.replace(/[[\]]/g, '')}](${h.url}) (${meta})`
    );
    if (h.snippet) lines.push(`   ${h.snippet.slice(0, 300)}`);
  });
  lines.push(
    '',
    '## Provenance',
    '',
    '| source | tier | ok | hits | ms | usd | note |',
    '|---|---|---|---|---|---|---|'
  );
  for (const r of result.runs) {
    lines.push(
      `| ${r.source} | ${r.tier} | ${r.ok} | ${r.hits} | ${r.ms} | ${r.usd.toFixed(5)} | ${r.skipped ?? r.error ?? ''} |`
    );
  }
  const compact = {
    ...result,
    hits: result.hits.map(({ content: _c, ...h }) => h),
  };
  lines.push('', `\`\`\`${RESULT_FENCE}`, JSON.stringify(compact), '```', '');
  return lines.join('\n');
}

export function parseResearchPage(markdown: string): ResearchResult | null {
  const match = markdown.match(
    new RegExp(`\`\`\`${RESULT_FENCE}\\n([\\s\\S]*?)\\n\`\`\``)
  );
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as ResearchResult;
    return parsed.schema === 'jovie-research-result/v1' ? parsed : null;
  } catch {
    return null;
  }
}

export async function loadResearch(
  gbrain: GbrainClient,
  key: string,
  now = Date.now()
): Promise<ResearchResult | null> {
  const page = await gbrain
    .call<{ compiled_truth?: string; content?: string } | string>('get_page', {
      slug: researchSlug(key),
      include_content: true,
    })
    .catch(() => null);
  if (!page || typeof page === 'string') return null;
  const result = parseResearchPage(page.content ?? page.compiled_truth ?? '');
  return result && Date.parse(result.expiresAt) > now ? result : null;
}

export async function saveResearch(
  gbrain: GbrainClient,
  result: ResearchResult,
  caller?: string
): Promise<string> {
  const slug = researchSlug(result.key);
  await gbrain.call('put_page', {
    slug,
    content: researchPage(result, caller),
  });
  return slug;
}
