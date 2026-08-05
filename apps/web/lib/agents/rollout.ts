/** Pure rollout assignment and segmented metric helpers for skill experiments. */

import type { SkillLifecycle, SkillVersionResolutionInput } from './lifecycle';
import { resolveSkillVersion } from './lifecycle';

export const CONTROL_COHORT = 'control';

export interface SkillRolloutConfig {
  /** Candidate exposure percentage, from 0 through 100. */
  readonly percentage?: number;
  /** Candidate version. Defaults to the catalog active version. */
  readonly version?: string;
  /** Named cohorts with exposure percentages; remaining traffic is control. */
  readonly cohorts?: Readonly<Record<string, number>>;
}

export interface SkillRolloutAssignment {
  readonly cohort: string;
  readonly skillVersion: string;
  readonly bucket: number;
}

export interface RolloutResolutionInput extends SkillVersionResolutionInput {
  readonly skillId: string;
  readonly userId: string;
  readonly rollout?: unknown;
  readonly existingAssignment?: SkillRolloutAssignment | null;
}

function stableBucket(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 10000;
}

function normalizeConfig(value: unknown): SkillRolloutConfig {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  const percentage =
    typeof candidate.percentage === 'number' &&
    Number.isFinite(candidate.percentage)
      ? Math.min(100, Math.max(0, candidate.percentage))
      : undefined;
  const cohorts =
    candidate.cohorts && typeof candidate.cohorts === 'object'
      ? Object.fromEntries(
          Object.entries(candidate.cohorts).filter(
            ([name, weight]) =>
              name !== CONTROL_COHORT &&
              typeof weight === 'number' &&
              Number.isFinite(weight) &&
              weight > 0
          )
        )
      : undefined;
  return {
    percentage,
    version:
      typeof candidate.version === 'string' ? candidate.version : undefined,
    cohorts,
  };
}

function assignCohort(config: SkillRolloutConfig, bucket: number): string {
  const cohorts = Object.entries(config.cohorts ?? {});
  const weightedTotal = cohorts.reduce((sum, [, weight]) => sum + weight, 0);
  if (weightedTotal > 0 && bucket < weightedTotal * 100) {
    let cursor = 0;
    for (const [name, weight] of cohorts) {
      cursor += weight * 100;
      if (bucket < cursor) return name;
    }
  }
  if (config.percentage !== undefined && bucket < config.percentage * 100) {
    return 'candidate';
  }
  return CONTROL_COHORT;
}

export function resolveSkillRollout(input: RolloutResolutionInput): {
  readonly assignment: SkillRolloutAssignment;
  readonly version: string;
  readonly lifecycle: SkillLifecycle;
} {
  const baseVersion = resolveSkillVersion(input);
  if (input.lifecycle === 'disabled') {
    return {
      assignment: {
        cohort: CONTROL_COHORT,
        skillVersion: baseVersion,
        bucket: 0,
      },
      version: baseVersion,
      lifecycle: input.lifecycle,
    };
  }

  const existing = input.existingAssignment;
  if (existing) {
    return {
      assignment: existing,
      version: existing.skillVersion,
      lifecycle: input.lifecycle,
    };
  }

  const bucket = stableBucket(`${input.skillId}:${input.userId}`);
  const config = normalizeConfig(input.rollout);
  const cohort = assignCohort(config, bucket);
  const candidate = cohort !== CONTROL_COHORT;
  const preferredVersion = candidate ? config.version : null;
  const version =
    preferredVersion &&
    (!input.availableVersions ||
      input.availableVersions.includes(preferredVersion))
      ? preferredVersion
      : baseVersion;
  return {
    assignment: { cohort, skillVersion: version, bucket },
    version,
    lifecycle: input.lifecycle,
  };
}

export function isRolloutConfig(value: unknown): value is SkillRolloutConfig {
  return typeof value === 'object' && value !== null;
}
