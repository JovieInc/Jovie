import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

export type EscalationTrigger =
  | 'repeated_no_diff'
  | 'semantic_ci_failure'
  | 'conflict_complexity'
  | 'repeated_review_comments'
  | 'sensitive_architecture_scope'
  | 'two_failed_cheap_attempts';

export type EscalationRoute =
  | 'mechanical-cheap'
  | 'codex-semantic-repair'
  | 'independent-verification';

export interface EscalationObservation {
  readonly noDiffAttempts?: number;
  readonly cheapFailures?: number;
  readonly semanticCiFailures?: number;
  readonly conflictFiles?: number;
  readonly conflictHunks?: number;
  readonly repeatedReviewComments?: number;
  readonly text?: string;
  readonly labels?: readonly string[];
}

export interface EscalationDecision {
  readonly escalate: boolean;
  readonly triggers: readonly EscalationTrigger[];
  readonly route: EscalationRoute;
  readonly cooldownUntil: string | null;
  readonly evidence: Readonly<Record<string, number | string>>;
}

export interface EscalationAttempt {
  readonly at: string;
  readonly route: EscalationRoute;
  readonly outcome:
    | 'success'
    | 'failure'
    | 'no-diff'
    | 'ci-failure'
    | 'conflict'
    | 'review-failure';
  readonly artifactPath?: string;
}

export interface EscalationRecord {
  readonly issue: number;
  readonly attempts: readonly EscalationAttempt[];
  readonly cooldownUntil: string | null;
  readonly updatedAt: string;
}

export interface EscalationState {
  readonly version: 1;
  readonly records: Readonly<Record<string, EscalationRecord>>;
}

export const DEFAULT_ESCALATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const TWO_FAILED_CHEAP_ATTEMPTS = 2;
export const NO_DIFF_THRESHOLD = 2;
export const SEMANTIC_CI_FAILURE_THRESHOLD = 1;
export const CONFLICT_FILE_THRESHOLD = 5;
export const CONFLICT_HUNK_THRESHOLD = 10;
export const REPEATED_REVIEW_THRESHOLD = 2;

const SENSITIVE_SCOPE =
  /\b(security|secret|auth|billing|payment|database|db|drizzle|migration|rls|ci|github actions|workflow|architecture|infra|infrastructure|release)\b/i;

export function evaluateEscalation(
  observation: EscalationObservation,
  now = new Date(),
  cooldownUntil: string | null = null
): EscalationDecision {
  const triggers: EscalationTrigger[] = [];
  if ((observation.noDiffAttempts ?? 0) >= NO_DIFF_THRESHOLD)
    triggers.push('repeated_no_diff');
  if ((observation.semanticCiFailures ?? 0) >= SEMANTIC_CI_FAILURE_THRESHOLD)
    triggers.push('semantic_ci_failure');
  if (
    (observation.conflictFiles ?? 0) >= CONFLICT_FILE_THRESHOLD ||
    (observation.conflictHunks ?? 0) >= CONFLICT_HUNK_THRESHOLD
  )
    triggers.push('conflict_complexity');
  if ((observation.repeatedReviewComments ?? 0) >= REPEATED_REVIEW_THRESHOLD)
    triggers.push('repeated_review_comments');
  if (
    SENSITIVE_SCOPE.test(
      `${observation.text ?? ''} ${(observation.labels ?? []).join(' ')}`
    )
  )
    triggers.push('sensitive_architecture_scope');
  if ((observation.cheapFailures ?? 0) >= TWO_FAILED_CHEAP_ATTEMPTS)
    triggers.push('two_failed_cheap_attempts');

  const activeCooldown =
    cooldownUntil !== null && Date.parse(cooldownUntil) > now.getTime();
  const escalate = triggers.length > 0 && !activeCooldown;
  const nextCooldown = escalate
    ? new Date(now.getTime() + DEFAULT_ESCALATION_COOLDOWN_MS).toISOString()
    : cooldownUntil;
  return {
    escalate,
    triggers,
    route: escalate ? 'codex-semantic-repair' : 'mechanical-cheap',
    cooldownUntil: nextCooldown,
    evidence: {
      cheapFailures: observation.cheapFailures ?? 0,
      noDiffAttempts: observation.noDiffAttempts ?? 0,
      semanticCiFailures: observation.semanticCiFailures ?? 0,
      conflictFiles: observation.conflictFiles ?? 0,
      conflictHunks: observation.conflictHunks ?? 0,
      repeatedReviewComments: observation.repeatedReviewComments ?? 0,
    },
  };
}

export function emptyEscalationState(): EscalationState {
  return { version: 1, records: {} };
}

export function readEscalationState(path: string): EscalationState {
  if (!existsSync(path)) return emptyEscalationState();
  try {
    const parsed = JSON.parse(
      readFileSync(path, 'utf8')
    ) as Partial<EscalationState>;
    if (
      parsed.version !== 1 ||
      typeof parsed.records !== 'object' ||
      parsed.records === null
    )
      return emptyEscalationState();
    return parsed as EscalationState;
  } catch {
    return emptyEscalationState();
  }
}

export function recordEscalationAttempt(
  state: EscalationState,
  issue: number,
  attempt: EscalationAttempt,
  cooldownUntil: string | null
): EscalationState {
  const key = String(issue);
  const prior = state.records[key];
  return {
    version: 1,
    records: {
      ...state.records,
      [key]: {
        issue,
        attempts: [...(prior?.attempts ?? []), attempt].slice(-20),
        cooldownUntil,
        updatedAt: attempt.at,
      },
    },
  };
}

export function writeEscalationState(
  path: string,
  state: EscalationState
): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, path);
}

export function buildEscalationArtifact(
  issue: number,
  decision: EscalationDecision,
  statePath: string
): string {
  return JSON.stringify(
    {
      schema: 'jovie.model-escalation/v1',
      issue,
      decision,
      routes: {
        mechanical: 'Grok/DeepSeek cheap lane',
        semanticRepair: 'Codex CLI via codex exec',
        verification: ['Summer', 'Luna', 'Terra'],
      },
      statePath,
      safety: {
        reversible: true,
        merge: false,
        trades: false,
        payments: false,
        secrets: false,
      },
    },
    null,
    2
  );
}

export type RepairWorkKind = 'mechanical' | 'normal' | 'semantic';

export const GEM_MODEL_REGISTRY = Object.freeze({
  mechanical: Object.freeze({
    model: 'qwen3:4b-q4_K_M',
    provider: 'ollama' as const,
  }),
  normal: Object.freeze({
    model: 'deepseek/deepseek-v4-flash',
    provider: 'openrouter' as const,
  }),
  escalation: Object.freeze({ model: 'codex', provider: 'codex-cli' as const }),
  verification: Object.freeze(['luna', 'terra']),
  architecture: 'sol',
});

export interface RepairRoute {
  readonly route: EscalationRoute;
  readonly model: string;
  readonly provider: 'ollama' | 'openrouter' | 'codex-cli';
  readonly deterministicGate: boolean;
  readonly codexAllowed: boolean;
  readonly costCapUsd: number;
}

/** Main/PR/new-issue work ordering. Red main is always the first lane. */
export function rankRepairWork(input: {
  readonly mainRed: boolean;
  readonly blockedPrs: number;
  readonly newIssues: number;
}): readonly string[] {
  return [
    ...(input.mainRed ? ['main-red'] : []),
    ...(input.blockedPrs > 0 ? ['pr-remediation'] : []),
    ...(input.newIssues > 0 ? ['new-pr'] : []),
  ];
}

/** Shared Gem model registry/router; Codex is exception-only after evidence. */
export function routeRepairWork(input: {
  readonly workKind: RepairWorkKind;
  readonly mainRed?: boolean;
  readonly cheapFailures?: number;
  readonly changedFiles?: readonly string[];
}): RepairRoute {
  const semantic =
    input.workKind === 'semantic' ||
    (input.cheapFailures ?? 0) >= TWO_FAILED_CHEAP_ATTEMPTS;
  if (semantic) {
    return {
      route: 'codex-semantic-repair',
      model: GEM_MODEL_REGISTRY.escalation.model,
      provider: GEM_MODEL_REGISTRY.escalation.provider,
      deterministicGate: true,
      codexAllowed: true,
      costCapUsd: 0,
    };
  }
  if (input.workKind === 'mechanical') {
    return {
      route: 'mechanical-cheap',
      model: GEM_MODEL_REGISTRY.mechanical.model,
      provider: GEM_MODEL_REGISTRY.mechanical.provider,
      deterministicGate: true,
      codexAllowed: false,
      costCapUsd: 0,
    };
  }
  return {
    route: 'mechanical-cheap',
    model: GEM_MODEL_REGISTRY.normal.model,
    provider: GEM_MODEL_REGISTRY.normal.provider,
    deterministicGate: true,
    codexAllowed: false,
    costCapUsd: 0,
  };
}

export function buildRepairArtifact(input: {
  readonly workId: string;
  readonly priority: 'main-red' | 'pr-remediation' | 'new-pr';
  readonly route: RepairRoute;
  readonly attempt: number;
  readonly cooldownUntil: string | null;
}): string {
  return JSON.stringify(
    {
      schema: 'jovie.repair/v1',
      workId: input.workId,
      priority: input.priority,
      route: input.route,
      attempt: input.attempt,
      cooldownUntil: input.cooldownUntil,
      registry: {
        verification: GEM_MODEL_REGISTRY.verification,
        architecture: GEM_MODEL_REGISTRY.architecture,
      },
      safety: {
        merge: false,
        admin: false,
        tasteGateMutation: false,
        secrets: false,
      },
    },
    null,
    2
  );
}
