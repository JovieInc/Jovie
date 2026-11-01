// Cross-document consistency for the investor deck: the deck may not say
// anything the claims ledger has retired, and its headline quantities must
// agree with the application drafts. Pure functions over text; build.mjs
// feeds it the private ledger and drafts.

import {
  claimNumbers,
  isRetiredClaim,
  normalizeClaimNumber,
} from '../../apps/web/lib/investors/yc-deck.ts';

/**
 * Quantity families an investor compares across the deck and the
 * application. A family value in the deck that the drafts never state is a
 * contradiction (e.g. deck "29 months", drafts "23 months").
 */
export const QUANTITY_FAMILIES = Object.freeze([
  { id: 'runway-months', pattern: /\b(\d+(?:\.\d+)?)[ -]months?\b/gu },
  {
    id: 'monthly-burn',
    pattern:
      /\$(\d[\d,.]*K?):? (?:a month|per month)\b|\$(\d[\d,.]*K?)\/mo\b/gu,
  },
  {
    id: 'view-counts',
    pattern:
      /\b(\d[\d.]*M\+?):?(?:[ -][A-Za-z]+){0,3}?[ -](?:views?|plays?)\b/gu,
  },
  {
    id: 'raise',
    pattern:
      /\$(\d[\d,.]*K)\b(?=[^.\n]{0,40}\b(?:for 10%|funds|SAFE|investment)\b)/gu,
  },
  {
    id: 'mrr',
    pattern: /\$(\d[\d,.]*K?):? MRR\b|MRR (?:of )?\$(\d[\d,.]*K?)/gu,
  },
]);

function familyValues(text, family) {
  const out = new Set();
  for (const match of text.matchAll(family.pattern)) {
    const value = match.slice(1).find(Boolean);
    if (value) out.add(value.toLowerCase());
  }
  return out;
}

/**
 * Values of retired claims that no live claim, metric or fact also states.
 * Seeing one anywhere means a dropped figure came back.
 */
export function retiredValues(ledger) {
  const live = new Set();
  const retired = new Map();
  for (const [id, claim] of Object.entries(ledger.claims)) {
    const values = (claim.values ?? []).map(v =>
      normalizeClaimNumber(String(v))
    );
    if (isRetiredClaim(claim)) for (const v of values) retired.set(v, id);
    else for (const v of values) live.add(v);
  }
  for (const kind of ['metrics', 'facts'])
    for (const row of Object.values(ledger[kind] ?? {})) {
      const text = String(row.render ?? row.value ?? '');
      live.add(normalizeClaimNumber(text));
      for (const n of claimNumbers(text)) live.add(n);
    }
  for (const v of live) retired.delete(v);
  return retired;
}

/** Text that matters for consistency: drop source lines and agent notes. */
export function draftProse(markdown) {
  return markdown
    .split('\n')
    .filter(
      line =>
        !/^\s*(?:>|- \*\*|_id |\[ASSET\]|\[TIM|Rendered |\(\d+(?:\/\d+)? chars\))/u.test(
          line
        )
    )
    .join('\n');
}

/**
 * @param {{ deckText: string, drafts: Record<string,string>, ledger: any }} input
 * @returns {{ ok: boolean, issues: string[], families: Record<string, {deck: string[], drafts: string[]}> }}
 */
export function checkConsistency({ deckText, drafts, ledger }) {
  const issues = [];
  const retired = retiredValues(ledger);
  const draftText = Object.values(drafts).map(draftProse).join('\n');

  for (const number of claimNumbers(deckText)) {
    const id = retired.get(number);
    if (id)
      issues.push(`deck states "${number}", a value of retired claim ${id}`);
  }
  for (const [name, text] of Object.entries(drafts))
    for (const number of claimNumbers(draftProse(text))) {
      const id = retired.get(number);
      if (id)
        issues.push(
          `${name} states "${number}", a value of retired claim ${id}`
        );
    }

  /** @type {Record<string, {deck: string[], drafts: string[]}>} */
  const families = {};
  for (const family of QUANTITY_FAMILIES) {
    const deck = familyValues(deckText, family);
    const draft = familyValues(draftText, family);
    families[family.id] = { deck: [...deck], drafts: [...draft] };
    for (const value of deck)
      if (draft.size && !draft.has(value))
        issues.push(
          `${family.id}: deck says ${value}; drafts say ${[...draft].join(', ')}`
        );
  }
  return { ok: issues.length === 0, issues, families };
}
