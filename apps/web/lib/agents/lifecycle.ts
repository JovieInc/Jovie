/**
 * Skill lifecycle state machine + version resolution (JOV-3944).
 *
 * Pure helpers — no DB. Callers load catalog rows and apply these rules
 * before invocation. Kill-switch (`disabled`) never throws; it returns a
 * graceful user-facing message for the product surface to render.
 */

export const SKILL_LIFECYCLES = [
  'draft',
  'dogfood',
  'cohort',
  'ga',
  'deprecated',
  'disabled',
] as const;

export type SkillLifecycle = (typeof SKILL_LIFECYCLES)[number];

/** Default for existing registry skills until an author opts into staged rollout. */
export const DEFAULT_SKILL_LIFECYCLE: SkillLifecycle = 'ga';

export const DEFAULT_SKILL_VERSION = '1.0.0';

/**
 * Legal one-step transitions only. Multi-step promotions (draft → ga)
 * must walk the intermediate states so each gate is intentional.
 */
export const SKILL_LIFECYCLE_TRANSITIONS: Readonly<
  Record<SkillLifecycle, readonly SkillLifecycle[]>
> = {
  draft: ['dogfood', 'disabled'],
  dogfood: ['cohort', 'draft', 'disabled'],
  cohort: ['ga', 'dogfood', 'disabled'],
  ga: ['deprecated', 'disabled'],
  deprecated: ['ga', 'disabled'],
  // Re-open only to draft so operators re-enter the promotion ladder cleanly.
  disabled: ['draft'],
};

/** In-product copy when a skill is kill-switched. Never a crash. */
export const SKILL_DISABLED_USER_MESSAGE =
  'This skill is temporarily unavailable. Try another action or check back soon.';

export const SKILL_DEPRECATED_USER_MESSAGE =
  'This skill is deprecated and may be removed. Prefer the replacement skill if one is offered.';

export interface SkillLifecycleState {
  readonly lifecycle: SkillLifecycle;
  readonly version: string;
  readonly activeVersion: string;
}

export interface SkillVersionResolutionInput extends SkillLifecycleState {
  /** Versions that still exist (catalog_versions rows or registry). */
  readonly availableVersions?: readonly string[];
  /**
   * Cohort/flag-aware override. Honored only in dogfood/cohort so GA
   * traffic stays on activeVersion unless an operator rolls back.
   */
  readonly preferredVersion?: string | null;
}

export type SkillInvocationGate =
  | {
      readonly ok: true;
      readonly version: string;
      readonly lifecycle: SkillLifecycle;
    }
  | {
      readonly ok: false;
      readonly reason: 'disabled' | 'unknown_version';
      readonly message: string;
      readonly lifecycle: SkillLifecycle;
    };

export function isSkillLifecycle(value: unknown): value is SkillLifecycle {
  return (
    typeof value === 'string' &&
    (SKILL_LIFECYCLES as readonly string[]).includes(value)
  );
}

export function canTransitionSkillLifecycle(
  from: SkillLifecycle,
  to: SkillLifecycle
): boolean {
  if (from === to) {
    return true;
  }
  return SKILL_LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function assertSkillLifecycleTransition(
  from: SkillLifecycle,
  to: SkillLifecycle
): void {
  if (!canTransitionSkillLifecycle(from, to)) {
    throw new Error(
      `Illegal skill lifecycle transition: ${from} → ${to}. Legal next states: ${SKILL_LIFECYCLE_TRANSITIONS[from].join(', ') || '(none)'}`
    );
  }
}

/**
 * Resolve which version should run for this invocation.
 * Rollback is modeled as flipping `activeVersion` — this helper always
 * prefers that pointer unless a cohort preferredVersion is in-bounds.
 */
export function resolveSkillVersion(
  input: SkillVersionResolutionInput
): string {
  const available = input.availableVersions;
  const preferred = input.preferredVersion;

  if (
    preferred &&
    (input.lifecycle === 'dogfood' || input.lifecycle === 'cohort') &&
    (!available || available.includes(preferred))
  ) {
    return preferred;
  }

  if (available && !available.includes(input.activeVersion)) {
    // Fail soft to the row's content version if the pointer is stale.
    return input.version;
  }

  return input.activeVersion || input.version;
}

/**
 * Gate skill invocation. `disabled` short-circuits with a graceful message.
 * Other lifecycles remain invocable (including deprecated — operators may
 * still need it until traffic fully drains).
 */
export function gateSkillInvocation(
  input: SkillVersionResolutionInput
): SkillInvocationGate {
  const lifecycle = input.lifecycle;
  if (lifecycle === 'disabled') {
    return {
      ok: false,
      reason: 'disabled',
      message: SKILL_DISABLED_USER_MESSAGE,
      lifecycle,
    };
  }

  const version = resolveSkillVersion(input);
  if (
    input.availableVersions &&
    input.availableVersions.length > 0 &&
    !input.availableVersions.includes(version)
  ) {
    return {
      ok: false,
      reason: 'unknown_version',
      message: SKILL_DISABLED_USER_MESSAGE,
      lifecycle,
    };
  }

  return { ok: true, version, lifecycle };
}

/**
 * Apply a rollback by returning the next state with activeVersion flipped.
 * Does not mutate lifecycle. Caller persists the result.
 */
export function rollbackSkillActiveVersion(
  state: SkillLifecycleState,
  targetVersion: string,
  availableVersions?: readonly string[]
): SkillLifecycleState {
  if (availableVersions && !availableVersions.includes(targetVersion)) {
    throw new Error(
      `Cannot rollback skill to unknown version "${targetVersion}"`
    );
  }
  return {
    ...state,
    activeVersion: targetVersion,
  };
}

/**
 * Normalize registry / DB rows that predate lifecycle columns.
 * Missing fields → ga / version (migration-drift fail-soft defaults).
 */
export function normalizeSkillLifecycleState(input: {
  readonly version?: string | null;
  readonly activeVersion?: string | null;
  readonly lifecycle?: string | null;
}): SkillLifecycleState {
  const version = input.version?.trim() || DEFAULT_SKILL_VERSION;
  const activeVersion = input.activeVersion?.trim() || version;
  const lifecycle = isSkillLifecycle(input.lifecycle)
    ? input.lifecycle
    : DEFAULT_SKILL_LIFECYCLE;
  return { version, activeVersion, lifecycle };
}
