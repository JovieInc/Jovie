// Prompt, schema and aggregation for the "would you invest" eval. Pure.

import { INVEST_OUTCOME, PERSONA_LABEL } from './personas.mjs';

export const RUBRIC_VERSION = 'invest-v1';
export const OBJECTION_KINDS = Object.freeze([
  'story', // fixable by how the deck tells true facts
  'evidence', // a true fact exists but the deck does not show it
  'traction', // only real-world traction can fix it
  'team', // founder count, background
  'market',
  'product',
]);

/** Thresholds are policy, not probability (as in buyer-eval). */
export const YES_MEDIAN = 0.5;
export const YES_FLOOR = 0.35;
export const MIN_SAMPLES = 2;

export function buildInvestPrompt({ persona, deck }) {
  return [
    `You are simulating an investor lens (${PERSONA_LABEL}). Lens: ${persona.program}.`,
    persona.brief,
    '',
    `Question: ${INVEST_OUTCOME}`,
    '',
    'Judge only the deck below. Do not assume facts it does not state. Treat dated, sourced figures as true; treat anything labeled founder-attested, opinion or assumption as such.',
    'Answer in this order: your objections (most important first), then the evidence that argues for investing, then p_invest (0 to 1) and your verdict, then the single most fixable objection and what would fix it.',
    'For each objection give a kind: story (the deck tells true facts badly), evidence (a fact likely exists but is not shown), traction, team, market or product.',
    '',
    'DECK',
    deck,
  ].join('\n');
}

export function buildInvestSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['objections', 'for', 'p_invest', 'verdict', 'most_fixable'],
    properties: {
      objections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'kind', 'slide'],
          properties: {
            text: { type: 'string' },
            kind: { type: 'string', enum: [...OBJECTION_KINDS] },
            slide: { type: 'string' },
          },
        },
      },
      for: { type: 'array', items: { type: 'string' } },
      p_invest: { type: 'number' },
      verdict: { type: 'string', enum: ['invest', 'pass'] },
      most_fixable: {
        type: 'object',
        additionalProperties: false,
        required: ['objection', 'fix', 'kind'],
        properties: {
          objection: { type: 'string' },
          fix: { type: 'string' },
          kind: { type: 'string', enum: [...OBJECTION_KINDS] },
        },
      },
    },
  };
}

/** Validate one sample; incoherent samples throw and are excluded. */
export function parseInvestSample(raw) {
  const p = Number(raw?.p_invest);
  if (!Number.isFinite(p) || p < 0 || p > 1)
    throw new Error('p_invest out of range');
  // The forecast is p. A stated verdict that disagrees with p is recorded, not
  // trusted (glm-5.3 returned "invest" with p 0.2 on 2026-11-01).
  const verdict = p >= 0.5 ? 'invest' : 'pass';
  const verdictMismatch = raw.verdict !== verdict;
  const objections = (raw.objections ?? []).filter(
    o => o?.text && OBJECTION_KINDS.includes(o.kind)
  );
  return {
    p,
    verdict,
    verdictMismatch,
    objections,
    for: (raw.for ?? []).map(String),
    mostFixable: raw.most_fixable ?? null,
  };
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * One persona's verdict from its coherent samples: invest when the median
 * p >= YES_MEDIAN and no sample is below YES_FLOOR. Too few samples abstain.
 */
export function aggregateInvest(samples) {
  if (samples.length < MIN_SAMPLES)
    return {
      verdict: 'abstain',
      p: null,
      spread: null,
      objections: [],
      mostFixable: null,
    };
  const ps = samples.map(s => s.p);
  const p = median(ps);
  const verdict =
    p >= YES_MEDIAN && Math.min(...ps) >= YES_FLOOR ? 'invest' : 'pass';
  const counts = new Map();
  for (const sample of samples)
    for (const o of sample.objections.slice(0, 3)) {
      const key = `${o.kind}:${o.slide}`;
      const row = counts.get(key) ?? {
        kind: o.kind,
        slide: o.slide,
        text: o.text,
        votes: 0,
      };
      row.votes += 1;
      counts.set(key, row);
    }
  const objections = [...counts.values()]
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 3);
  const fixable = samples
    .map(s => s.mostFixable)
    .filter(f => f && f.kind !== 'traction');
  return {
    verdict,
    p,
    spread: Math.max(...ps) - Math.min(...ps),
    ps,
    objections,
    mostFixable: fixable[0] ?? samples[0].mostFixable,
  };
}
