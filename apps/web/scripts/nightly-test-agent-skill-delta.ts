/**
 * Consume-before-select helpers for the nightly testing agent.
 * Loads prior skill-delta.json and scores preference so test investment compounds.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { NightlyAgentSkillDelta } from '@/lib/testing/nightly-agent-report';

/** Prefer prior skill-delta targets so nightly investment compounds. */
export const SKILL_DELTA_PRIOR_TARGET_WEIGHT = 36;
export const SKILL_DELTA_FAILURE_WEIGHT = 20;
export const SKILL_DELTA_MUTATION_WEIGHT = 10;

export interface SkillDeltaRiskItem {
  id: string;
  module: string;
  paths: string[];
  relatedTests?: string[];
  mutationSurvivors?: number;
}

export interface LoadedSkillDelta {
  delta: NightlyAgentSkillDelta | null;
  path: string | null;
  consumed: boolean;
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll('\\', '/').replace(/^\.?\//, '');
}

function pathMatches(filePath: string, patterns: readonly string[]): boolean {
  const normalized = normalizePath(filePath);
  return patterns.some(pattern => {
    const cleanPattern = normalizePath(pattern);
    if (cleanPattern.endsWith('/')) {
      return normalized.startsWith(cleanPattern);
    }
    return normalized === cleanPattern;
  });
}

function resolveFromRoot(repoRoot: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isSkillDeltaShape(value: unknown): value is NightlyAgentSkillDelta {
  if (!value || typeof value !== 'object') return false;
  const delta = value as Partial<NightlyAgentSkillDelta>;
  return (
    typeof delta.generatedAt === 'string' && typeof delta.repo === 'string'
  );
}

export function skillDeltaCandidatePaths(
  repoRoot: string,
  args: Record<string, string>
): string[] {
  return [
    args['skill-delta'] ? resolveFromRoot(repoRoot, args['skill-delta']) : null,
    path.join(
      repoRoot,
      'apps/web/test-results/nightly-agent/prior/skill-delta.json'
    ),
    path.join(repoRoot, 'apps/web/reports/nightly-agent/skill-delta.json'),
    path.join(repoRoot, '.agents/skills/nightly-test-agent/skill-delta.json'),
    path.join(repoRoot, 'apps/web/test-results/nightly-agent/skill-delta.json'),
  ].filter((value): value is string => Boolean(value));
}

/**
 * Consume-before-select: load the newest available skill-delta before ranking.
 * Missing delta is allowed (first run); rediscovery must not skip an existing file.
 */
export function loadSkillDeltaMemory(
  repoRoot: string,
  args: Record<string, string>,
  repo: string
): LoadedSkillDelta {
  for (const candidate of skillDeltaCandidatePaths(repoRoot, args)) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed: unknown = readJson(candidate);
      if (!isSkillDeltaShape(parsed)) {
        console.warn(`Ignoring invalid skill-delta at ${candidate}`);
        continue;
      }
      if (parsed.repo !== repo) {
        console.warn(
          `Ignoring skill-delta repo mismatch at ${candidate} (wanted ${repo}, got ${parsed.repo})`
        );
        continue;
      }
      return { delta: parsed, path: candidate, consumed: true };
    } catch (error) {
      console.warn(`Failed to read skill-delta at ${candidate}:`, error);
    }
  }
  return { delta: null, path: null, consumed: false };
}

function relatedSkillDeltaFailureCount(
  item: SkillDeltaRiskItem,
  delta: NightlyAgentSkillDelta
): number {
  return (delta.failures ?? []).filter(failure => {
    const file = failure.file ?? failure.testId;
    return (
      pathMatches(file, item.paths) ||
      pathMatches(file, item.relatedTests ?? [])
    );
  }).length;
}

export function skillDeltaPreference(
  item: SkillDeltaRiskItem,
  delta: NightlyAgentSkillDelta | null
): { score: number; reasons: string[] } {
  if (!delta) {
    return { score: 0, reasons: [] };
  }
  let score = 0;
  const reasons: string[] = [];
  const priorTarget = (delta.selectedTargets ?? []).find(
    target => target.id === item.id || target.module === item.module
  );
  if (priorTarget) {
    score += SKILL_DELTA_PRIOR_TARGET_WEIGHT;
    reasons.push('Prior skill-delta target');
  }
  const failureHits = relatedSkillDeltaFailureCount(item, delta);
  if (failureHits > 0) {
    score += Math.min(
      SKILL_DELTA_FAILURE_WEIGHT,
      failureHits * (SKILL_DELTA_FAILURE_WEIGHT / 2)
    );
    reasons.push('Skill-delta failure memory');
  }
  if (
    (delta.mutation?.survived ?? 0) > 0 &&
    (item.mutationSurvivors ?? 0) > 0
  ) {
    score += SKILL_DELTA_MUTATION_WEIGHT;
    reasons.push('Skill-delta mutation debt');
  }
  return { score, reasons };
}

export interface SkillDeltaScoreItem extends SkillDeltaRiskItem {
  criticality: number;
  reasons: string[];
  lanes: string[];
  historicFailRate?: number;
  avgDurationMs?: number;
  flakeScore?: number;
}

export interface SkillDeltaFailureRecord {
  testId: string;
  file?: string;
  module?: string;
}

export interface SkillDeltaQuarantineRecord {
  id: string;
}

export interface SkillDeltaRiskWeights {
  criticality: number;
  recentFailure: number;
  mutationSurvivor: number;
  flake: number;
  duration: number;
  quarantine: number;
}

function relatedFailureCount(
  item: SkillDeltaScoreItem,
  failures: readonly SkillDeltaFailureRecord[]
): number {
  return failures.filter(record => {
    const file = record.file ?? record.testId;
    return (
      record.module === item.id ||
      record.module === item.module ||
      pathMatches(file, item.paths) ||
      pathMatches(file, item.relatedTests ?? [])
    );
  }).length;
}

function quarantineHit(
  item: SkillDeltaScoreItem,
  quarantine: readonly SkillDeltaQuarantineRecord[]
): number {
  return quarantine.some(record =>
    pathMatches(record.id, [...item.paths, ...(item.relatedTests ?? [])])
  )
    ? 1
    : 0;
}

/** Rank one risk item after skill-delta has been loaded (consume-before-select). */
export function scoreRiskItemWithSkillDelta(params: {
  item: SkillDeltaScoreItem;
  failures: readonly SkillDeltaFailureRecord[];
  quarantine: readonly SkillDeltaQuarantineRecord[];
  protectedPathPrefixes: readonly string[];
  riskWeights: SkillDeltaRiskWeights;
  skillDelta: NightlyAgentSkillDelta | null;
}): {
  score: number;
  scoreBreakdown: Record<string, number>;
  reasons: string[];
  recommendedLanes: string[];
} {
  const { item, failures, quarantine, protectedPathPrefixes, riskWeights } =
    params;
  const recentFailures = relatedFailureCount(item, failures);
  const inQuarantine = quarantineHit(item, quarantine);
  const protectedPath = item.paths.some(itemPath =>
    pathMatches(itemPath, protectedPathPrefixes)
  )
    ? 1
    : 0;
  const duration = item.avgDurationMs
    ? Math.min(1, item.avgDurationMs / 120_000)
    : 0;
  const preference = skillDeltaPreference(item, params.skillDelta);
  const scoreBreakdown = {
    criticality: item.criticality * riskWeights.criticality,
    recentFailure:
      Math.min(1, recentFailures / 3 + (item.historicFailRate ?? 0)) *
      riskWeights.recentFailure,
    mutationSurvivor:
      Math.min(1, (item.mutationSurvivors ?? 0) / 8) *
      riskWeights.mutationSurvivor,
    flake: (item.flakeScore ?? 0) * riskWeights.flake,
    duration: duration * riskWeights.duration,
    quarantine: inQuarantine * riskWeights.quarantine,
    protectedPath: protectedPath * 8,
    skillDelta: preference.score,
  };
  const score = Object.values(scoreBreakdown).reduce(
    (total, value) => total + value,
    0
  );
  return {
    score: Math.round(score * 100) / 100,
    scoreBreakdown,
    reasons: [...item.reasons, ...preference.reasons],
    recommendedLanes: [...new Set(item.lanes)],
  };
}
