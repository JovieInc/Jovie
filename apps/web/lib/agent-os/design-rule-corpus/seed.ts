import { readFileSync } from 'node:fs';

import { resolveMonorepoPath } from '@/lib/filesystem-paths';

import { type IngestResult, ingestRuleCandidates } from './corpus';
import { type DesignRuleCandidate, DesignRuleCandidateSchema } from './types';

export const DESIGN_RULE_CANDIDATES_SEGMENTS = [
  'canon',
  'design-rule-candidates.jsonl',
] as const;

export function getDesignRuleCandidatesPath(): string {
  return resolveMonorepoPath(...DESIGN_RULE_CANDIDATES_SEGMENTS);
}

/** Parses the mined candidate JSONL corpus into validated candidates. */
export function parseDesignRuleCandidatesJsonl(
  jsonl: string
): readonly DesignRuleCandidate[] {
  return jsonl
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => DesignRuleCandidateSchema.parse(JSON.parse(line)));
}

export function loadDesignRuleCandidateSeeds(
  path: string = getDesignRuleCandidatesPath()
): readonly DesignRuleCandidate[] {
  return parseDesignRuleCandidatesJsonl(readFileSync(path, 'utf8'));
}

/**
 * Loads the mined seed corpus and ingests it. External material only ever
 * creates candidates — nothing here is Jovie policy until a founder decision
 * and adversarial hardening promote it.
 */
export function ingestDesignRuleSeedCorpus(
  corpus: Parameters<typeof ingestRuleCandidates>[0],
  path: string = getDesignRuleCandidatesPath()
): IngestResult {
  return ingestRuleCandidates(corpus, loadDesignRuleCandidateSeeds(path));
}
