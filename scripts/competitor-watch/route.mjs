#!/usr/bin/env node
// Competitor-watch router: turns triaged items into routing decisions.
//   cost-loop   pricing / cost-saving items
//   adopt       adoptable-now items; opens the fast-adopt pipeline (docs/engineering/competitor-watch.md)
//   idea-radar  other high-relevance items, as canonical evidence (JOV-5916); no separate ledger
// Pure functions below; the CLI reads the Worker API and never writes Linear itself.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { normalizeObservation } from '../idea-radar/idea-radar.mjs';

export const ROUTE_MIN = 4;
export const COST_MIN = 3;

export function decideRoute(item) {
  const rel = item.relevance ?? 0;
  if (item.route_status && item.route_status !== 'new')
    return { destination: 'none', reason: 'already-routed' };
  if (item.cost_saving && rel >= COST_MIN) return { destination: 'cost-loop' };
  if (rel < ROUTE_MIN)
    return { destination: 'none', reason: 'below-threshold' };
  // Security notices are evidence, never auto-adopted.
  if (item.kind === 'security')
    return { destination: 'idea-radar', priority: 'high' };
  if (item.adoptable_now) return { destination: 'adopt' };
  // Unverified model opinion alone is weak: only a 5 becomes evidence without a concrete action.
  return rel >= 5
    ? { destination: 'idea-radar' }
    : { destination: 'none', reason: 'relevant-but-not-actionable' };
}

export function toObservation(item, research = []) {
  const surfaces = JSON.parse(item.surfaces ?? '[]');
  return normalizeObservation({
    problemOpportunity: `${item.summary || item.title} (${item.source}: ${item.why || 'no rationale'})`,
    affectedUser: 'Jovie artists and operators',
    affectedCapability: surfaces.join(', ') || 'unspecified',
    sourceUrl: item.url,
    sourceType: `competitor-watch:${item.source}`,
    sourceItemId: item.id,
    observedAt: item.published_at ?? item.first_seen_at,
    accessConstraints:
      'public vendor blog or changelog; link and our own summary only',
    freshness: item.published_at ? 'dated by source' : 'first seen by poller',
    engagementQuality: Math.min(1, (item.relevance ?? 0) / 5),
    evidenceQuality:
      'single vendor announcement; triaged by a small model, unverified',
    corroboration: research,
    initialDemandEvidence:
      'none; supply-side signal from a fast-shipping vendor',
    uncertainty:
      'triage is an 8B model estimate; adoption needs the fast-adopt gates',
    cheapestValidationAction: item.adoptable_now
      ? 'open a flagged PR and run the fast-adopt gates'
      : 'read the source and decide whether to open a research page',
    capacityClass: item.adoptable_now ? 'small-pr' : 'research',
    revenuePathConflict: item.cost_saving ? 'none; lowers spend' : 'none known',
  });
}

export function linearPayload(item, decision) {
  const lines = [
    '## Source',
    `- Competitor-watch item: ${item.url}`,
    `- Source feed: ${item.source}, first seen ${item.first_seen_at}`,
    '',
    '## Follow-up',
    item.summary || item.title,
    '',
    '## Why it matters',
    item.why || '',
  ];
  if (decision.destination === 'adopt') {
    lines.push(
      '',
      '## Done',
      '- Small PR behind a feature flag, gates green per docs/engineering/competitor-watch.md, canary enabled, keep-or-revert decision recorded.'
    );
  }
  if (decision.destination === 'cost-loop') {
    lines.push(
      '',
      '## Done',
      '- Savings estimated from our own usage ledger, then adopted or declined with the number recorded.'
    );
  }
  return {
    title: `[watch] ${item.title}`.slice(0, 120),
    description: lines.join('\n'),
    labels: [
      'competitor-watch',
      decision.destination === 'cost-loop' ? 'cost-savings' : 'compounding',
    ],
  };
}

const STOP = new Set([
  'now',
  'with',
  'that',
  'this',
  'from',
  'your',
  'introducing',
  'updated',
  'supports',
  'support',
  'into',
  'and',
  'the',
  'for',
  'new',
  'beta',
  'runs',
  'host',
]);

/** gbrain keyword search ANDs terms, so a full headline finds nothing: use the 3 most distinctive words. */
export function researchQuery(title, extra = '') {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w) && w !== extra);
  const top = new Set(
    [...new Set(words)]
      .sort((a, b) => b.length - a.length)
      .slice(0, extra ? 2 : 3)
  );
  return [
    ...words.filter((w, i) => top.has(w) && words.indexOf(w) === i),
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export function parseResearchSlugs(out) {
  return [
    ...out.matchAll(/^\[(\d+(?:\.\d+)?)\]\s+((?:research|decisions)\/\S+)/gm),
  ]
    .filter(m => Number(m[1]) >= 0.5)
    .map(m => m[2])
    .slice(0, 3);
}

function gbrainResearch(item) {
  const q = researchQuery(item.title, item.cost_saving ? 'pricing' : '');
  try {
    return parseResearchSlugs(
      execFileSync('gbrain', ['search', q], {
        encoding: 'utf8',
        timeout: 30000,
      })
    );
  } catch (e) {
    process.stderr.write(
      `gbrain search failed for ${item.id}: ${String(e.message).slice(0, 120)}\n`
    );
    return [];
  }
}

async function main() {
  const base = process.env.COMPETITOR_WATCH_URL;
  const token = process.env.COMPETITOR_WATCH_TOKEN;
  if (!base || !token)
    throw new Error('set COMPETITOR_WATCH_URL and COMPETITOR_WATCH_TOKEN');
  const mark = process.argv.includes('--mark');
  const withResearch = process.argv.includes('--research');
  const headers = { authorization: `Bearer ${token}` };
  const { items } = await (
    await fetch(
      `${base}/items?route_status=new&min_relevance=${COST_MIN}&limit=100`,
      { headers }
    )
  ).json();
  const out = [];
  for (const item of items) {
    const decision = decideRoute(item);
    if (decision.destination === 'none') continue;
    const research = withResearch ? gbrainResearch(item) : [];
    const entry = {
      id: item.id,
      title: item.title,
      source: item.source,
      ...decision,
      research,
    };
    if (decision.destination === 'idea-radar')
      entry.evidence = toObservation(item, research);
    else entry.linear = linearPayload(item, decision);
    out.push(entry);
    if (mark) {
      await fetch(`${base}/items/${item.id}/routed`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ to: decision.destination }),
      });
    }
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  });
}
