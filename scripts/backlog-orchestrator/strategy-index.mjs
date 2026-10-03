import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STRATEGY_INDEX_SCHEMA = 'jovie-strategy-theses/v1';
export const STRATEGY_INDEX_PATH = 'canon/strategy/theses.jsonl';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

/**
 * Topics that make a lease strategy-sensitive. Deliberately phrase-level so
 * ordinary engineering work does not trigger doctrine retrieval.
 */
const STRATEGY_TRIGGERS = [
  /\b(?:product|company|pricing|monetization|growth|go[- ]?to[- ]?market)\s+strateg/i,
  /\bpric(?:e|ing)\b/i,
  /\bpackag(?:e|ing)\b/i,
  /\bfree\s+(?:plan|tier|plans|tiers)\b|\bfreemium\b/i,
  /\bbusiness\s+model\b|\brevenue\s+model\b|\bmonetiz/i,
  /\bcreator\s+(?:workflow|journey|experience)s?\b/i,
  /\bautonom(?:y|ous)\b|\bdelegat(?:e|ion|ed)\b/i,
  /\bmodel\s+rout(?:er|ing|e|es)\b/i,
  /\bagent\s+(?:ux|experience)\b/i,
  /\borchestrat(?:e|ion|ing)\b|\bswarm/i,
  /\bexecution\s+substrate\b|\bsubstrate\b/i,
  /\bcompany[- ]level\s+architecture\b|\bsystem\s+architecture\b/i,
  /\bside\s*quests?\b/i,
  /\blifetime\s+deals?\b|\bappsumo\b|\bltd\s+pricing\b/i,
  /\bsubsid(?:y|ies|ized)\b|\bmarginal\s+cost\b/i,
  /\bappsumo\b|\bcodex\s+cloud\b/i,
  /\bsandbox(?:es|ing)?\b/i,
  /\bone\s+accountable\s+agent\b|\baccountable\s+agent\b/i,
  /\bmanaged\s+outcome|\boutcome[- ]?sell|\bsell\s+outcomes?\b|\bsell\s+the\s+outcome\b/i,
  /\bmiddle\s+layer\b/i,
  /\bproductiz(?:e|ation|ing)\b/i,
];

/**
 * Adjacent-term expansion: words an issue author might use that should still
 * resolve to the doctrine's canonical retrieval anchors.
 */
/** @type {Array<[RegExp, string]>} */
const QUERY_EXPANSIONS = [
  [/\bfreemium\b/i, 'free plan'],
  [/\bappsumo\b/i, 'lifetime deal'],
  [/\bltd\b/i, 'lifetime deal'],
  [/\bperpetual\s+license\b|\bpay\s+once\b/i, 'lifetime deal'],
  [
    /\bswarms?\b|\bfleet\s+of\s+agents\b|\bmulti[- ]?agent\b|\bsub[- ]?agents?\b/i,
    'swarm',
  ],
  [/\bfounder\s+agent\b|\bsingle\s+agent\b|\bone\s+agent\b/i, 'one agent'],
  [
    /\brout(?:e|ing|er)\s+(?:between|across)\s+models\b|\bmodel\s+picker\b|\bmodel\s+select/i,
    'model routing',
  ],
  [
    /\bgpt[-\s]?\d|\bclaude\b|\bgemini\b|\bmodel\s+provider\b|\bllm\s+provider\b/i,
    'model routing',
  ],
  [/\bfirecracker\b|\be2b\b|\bdaytona\b|\bmicrovm/i, 'sandbox'],
  [
    /\bvercel\b|\bcodex\s+cloud\b|\bmodal\b|\bfly\.io\b/i,
    'execution substrate',
  ],
  [
    /\brevenue\s+model\b|\bcogs\b|\bcost\s+of\s+goods\b|\bunit\s+economics\b/i,
    'marginal cost business model',
  ],
  [/\bgiveaway\b|\bfree\s+forever\b/i, 'free tier subsidy'],
  [
    /\bconcierge\b|\bdone[- ]?for[- ]?you\b|\bdfy\b|\bagency\s+model\b/i,
    'managed outcome',
  ],
  [/\bhand[- ]?off\b|\bhandoff\b|\bentrust\b/i, 'delegation'],
  [/\bagentic\s+(?:ux|ui|experience)\b/i, 'agent ux'],
  [
    /\bplatform\s+lock[- ]?in\b|\bvendor\s+lock[- ]?in\b/i,
    'execution substrate',
  ],
  [/\bdistraction\b|\bbusywork\b|\bbusy\s+work\b/i, 'side quest'],
];

function normalize(text) {
  return ` ${String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')} `;
}

function issueText(issue) {
  return [issue?.title, issue?.description]
    .filter(value => typeof value === 'string')
    .join('\n');
}

export function isStrategySensitive(text) {
  return STRATEGY_TRIGGERS.some(trigger => trigger.test(String(text || '')));
}

export function expandStrategyTerms(text) {
  const raw = String(text || '');
  const expanded = new Set([raw]);
  for (const [pattern, expansion] of QUERY_EXPANSIONS) {
    if (pattern.test(raw)) expanded.add(expansion);
  }
  return [...expanded];
}

function parseRegistryLine(line) {
  const record = JSON.parse(line);
  if (record.schema === STRATEGY_INDEX_SCHEMA) return { header: record };
  if (!record.id || !record.slug || !Array.isArray(record.keywords))
    throw new Error('strategy-thesis-record-malformed');
  return { thesis: record };
}

const indexCache = new Map();

export function loadStrategyIndex(root = REPO_ROOT) {
  const cached = indexCache.get(root);
  if (cached) return cached;
  const raw = readFileSync(path.join(root, STRATEGY_INDEX_PATH), 'utf8');
  const theses = [];
  let header = null;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseRegistryLine(trimmed);
    if (parsed.header) header = parsed.header;
    if (parsed.thesis) theses.push(parsed.thesis);
  }
  if (!header) throw new Error('strategy-theses-header-missing');
  const index = {
    header,
    theses,
    byId: new Map(theses.map(t => [t.id, t])),
  };
  indexCache.set(root, index);
  return index;
}

function thesisScore(thesis, normalizedHaystacks) {
  let score = 0;
  for (const keyword of thesis.keywords) {
    const needle = ` ${String(keyword).toLowerCase()} `;
    if (normalizedHaystacks.some(haystack => haystack.includes(needle)))
      score += 1;
  }
  return score;
}

/**
 * Keyword/alias-first retrieval over the canonical thesis index. Returns the
 * active theses an agent must retrieve before planning, plus any superseded
 * theses that matched (retained for provenance, not doctrine).
 */
export function matchStrategyTheses(index, text) {
  const haystacks = expandStrategyTerms(text).map(normalize);
  const scored = index.theses
    .map(thesis => ({ thesis, score: thesisScore(thesis, haystacks) }))
    .filter(entry => entry.score > 0);
  const superseded = scored.filter(e => e.thesis.status === 'superseded');
  const active = scored.filter(e => e.thesis.status !== 'superseded');
  // Superseded doctrine must surface its current replacement, not the loser.
  for (const { thesis } of superseded) {
    const visited = new Set();
    let cursor = thesis;
    while (cursor?.supersededBy) {
      if (visited.has(cursor.id))
        throw new Error('strategy-thesis-supersession-cycle');
      visited.add(cursor.id);
      const winner = index.byId.get(cursor.supersededBy);
      if (!winner || winner.status === 'superseded') {
        cursor = winner;
        continue;
      }
      if (!active.some(e => e.thesis.id === winner.id))
        active.push({ thesis: winner, score: 0 });
      break;
    }
  }
  active.sort(
    (a, b) => b.score - a.score || a.thesis.id.localeCompare(b.thesis.id)
  );
  return {
    required: active.map(e => e.thesis),
    superseded: superseded.map(e => e.thesis),
  };
}

/**
 * The theses a strategy-sensitive lease must bind into its context receipt.
 * Non-sensitive issues return an empty list.
 *
 * @param {*} issue
 * @param {{ index?: ReturnType<typeof loadStrategyIndex> }} [options]
 */
export function requiredStrategyTheses(issue, options = {}) {
  const { index } = options;
  const text = issueText(issue);
  if (!isStrategySensitive(text)) return [];
  const resolved = index || loadStrategyIndex();
  return matchStrategyTheses(resolved, text).required;
}
