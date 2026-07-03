import { isAgentBranch } from './agent-branch.mjs';
import {
  extractTerminalFailureNames,
  normalizeCheckKey,
} from './ci-check-failures.mjs';

export const SYSTEMIC_THRESHOLD = 3;

/**
 * Given per-PR terminal required-check failures, return checks failing on
 * threshold+ agent PRs (including the current PR when provided).
 */
export function detectSystemicChecks(prFailures, { threshold = SYSTEMIC_THRESHOLD } = {}) {
  const counts = new Map();
  const displayNames = new Map();

  for (const entry of prFailures) {
    if (!entry.isAgent) continue;
    for (const name of entry.failures) {
      const key = normalizeCheckKey(name);
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!displayNames.has(key)) displayNames.set(key, name);
    }
  }

  const systemic = [];
  for (const [key, count] of counts) {
    if (count >= threshold) {
      systemic.push({
        key,
        name: displayNames.get(key) ?? key,
        count,
      });
    }
  }
  systemic.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return systemic;
}

export function buildPrFailureEntry(pr, failures) {
  return {
    number: pr.number,
    headRefName: pr.headRefName,
    isAgent: isAgentBranch(pr.headRefName),
    failures: extractTerminalFailureNames(failures),
  };
}

export function formatSystemicSummary(systemicChecks) {
  return systemicChecks
    .map(check => `${check.name} (failing on ${check.count} PRs)`)
    .join('; ');
}