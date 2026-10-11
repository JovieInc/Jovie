import { createHash } from 'node:crypto';
import type { Claim } from './registry';

/**
 * Claim-coverage audit for marketing copy (JOV-7247).
 *
 * Walks the exported values of copy modules, picks strings that make a
 * checkable assertion (money, percentages, multipliers, counted outcomes,
 * superlatives, comparisons), and resolves each against a registry claim.
 * Unresolved strings are recorded in a shrink-only baseline so existing copy
 * does not hard-fail, while any new unbacked claim does.
 */

export interface CopyClaimFinding {
  /** Stable key: `<file>#<hash of normalized text>`. */
  readonly key: string;
  readonly file: string;
  readonly text: string;
}

const CLAIM_SIGNALS: readonly RegExp[] = [
  /\$\s?\d/u,
  /\d\s?%/u,
  /\b\d+(?:\.\d+)?x\b/iu,
  /\b\d[\d,.]*\s?(?:k|m)?\+?\s(?:artists|fans|creators|users|customers|streams|plays|clicks|views|listeners|labels|teams|releases|minutes|hours|seconds)\b/iu,
  /\b(?:fastest|best|#1|number one|leading|most popular|only platform|guaranteed)\b/iu,
  /\b(?:faster|cheaper|better|more)\s+than\b/iu,
  /\bvs\.?\s/iu,
];

/** Strings with no letters are values (amount chips, counters), not claims. */
const HAS_LETTER = /\p{L}/u;

export function normalizeClaimText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim().toLowerCase();
}

export function isClaimBearing(text: string): boolean {
  if (!HAS_LETTER.test(text)) return false;
  return CLAIM_SIGNALS.some(signal => signal.test(text));
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/** Every string reachable from a module's exported values, in visit order. */
export function collectStrings(value: unknown): string[] {
  const out: string[] = [];
  const seen = new WeakSet<object>();
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      out.push(node);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      visit(child);
    }
  };
  visit(value);
  return out;
}

/**
 * A copy string resolves when it equals, or quotes, a registry claim
 * statement. Short statements (under 8 characters, e.g. "$0") only resolve
 * on exact match so they cannot bless unrelated sentences.
 */
export function resolvesToClaim(
  text: string,
  claims: readonly Claim[]
): boolean {
  const normalized = normalizeClaimText(text);
  return claims.some(claim => {
    const statement = normalizeClaimText(claim.statement);
    if (statement === normalized) return true;
    return statement.length >= 8 && normalized.includes(statement);
  });
}

export function auditCopyClaims(
  modules: Readonly<Record<string, unknown>>,
  claims: readonly Claim[]
): CopyClaimFinding[] {
  const findings = new Map<string, CopyClaimFinding>();
  for (const [file, moduleExports] of Object.entries(modules)) {
    for (const text of collectStrings(moduleExports)) {
      if (!isClaimBearing(text) || resolvesToClaim(text, claims)) continue;
      const key = `${file}#${hashText(normalizeClaimText(text))}`;
      if (!findings.has(key)) findings.set(key, { key, file, text });
    }
  }
  return [...findings.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface BaselineComparison {
  /** Unresolved claims not in the baseline: new unbacked copy. */
  readonly added: readonly CopyClaimFinding[];
  /** Baseline keys that no longer occur: shrink the baseline. */
  readonly stale: readonly string[];
}

/**
 * Public marketing copy must not claim web research. That job lives on
 * `profile-monitoring`, which is internal-only and has no public marketing
 * block (JOV-7581).
 */
export const UNCERTIFIED_WEB_RESEARCH_CLAIM = 'what the web says about you';

export function findUncertifiedWebResearchClaims(
  modules: Readonly<Record<string, unknown>>,
  phrase: string = UNCERTIFIED_WEB_RESEARCH_CLAIM
): CopyClaimFinding[] {
  const needle = normalizeClaimText(phrase);
  const findings = new Map<string, CopyClaimFinding>();
  for (const [file, moduleExports] of Object.entries(modules)) {
    for (const text of collectStrings(moduleExports)) {
      const normalized = normalizeClaimText(text);
      if (!normalized.includes(needle)) continue;
      const key = `${file}#${hashText(normalized)}`;
      if (!findings.has(key)) findings.set(key, { key, file, text });
    }
  }
  return [...findings.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function compareToBaseline(
  findings: readonly CopyClaimFinding[],
  baselineKeys: readonly string[]
): BaselineComparison {
  const baseline = new Set(baselineKeys);
  const current = new Set(findings.map(finding => finding.key));
  return {
    added: findings.filter(finding => !baseline.has(finding.key)),
    stale: baselineKeys.filter(key => !current.has(key)),
  };
}
