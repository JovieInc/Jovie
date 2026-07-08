/**
 * WorkflowDefinition registry (JovieInc/Jovie#10367).
 *
 * Single typed file per workflow kind. Callers import registerWorkflow and
 * add their definition; the cron processor iterates the registry to dispatch.
 *
 * Convention:
 * - kind: lowercase snake_case, globally unique across the registry
 * - inputSchema: zod shape validated before the executor is called
 * - executor: receives { workflowRunId, input } and must CAS the run to
 *   completed or failed before returning
 * - requiredConnectors: connector provider slugs the workflow needs OAuth
 *   tokens for (informational; enforcement is in the executor)
 * - retryPolicy: maxAttempts before the cron marks the run 'failed';
 *   backoffMs is the base delay (exponential or flat, executor's choice)
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs: number;
}

export interface WorkflowExecutorInput<TInput = unknown> {
  readonly workflowRunId: string;
  readonly input: TInput;
}

export type WorkflowExecutor<TInput = unknown> = (
  ctx: WorkflowExecutorInput<TInput>
) => Promise<void>;

export interface WorkflowDefinition<TInput = unknown> {
  readonly kind: string;
  readonly description: string;
  readonly inputSchema: z.ZodType<TInput>;
  readonly requiredConnectors: readonly string[];
  readonly retryPolicy: RetryPolicy;
  readonly executor: WorkflowExecutor<TInput>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

// ponytail: module-level singleton; one registry per process is all we need
const _registry = new Map<string, WorkflowDefinition>();

/**
 * Register a workflow definition. Throws if the kind is already registered
 * (import-time safety net — catches copy-paste duplicates immediately).
 */
export function registerWorkflow<TInput>(
  def: WorkflowDefinition<TInput>
): void {
  if (_registry.has(def.kind)) {
    throw new Error(
      `[workflow-registry] WorkflowDefinition '${def.kind}' already registered`
    );
  }
  _registry.set(def.kind, def as WorkflowDefinition);
}

/** Retrieve a WorkflowDefinition by kind, or undefined if unknown. */
export function getWorkflow(kind: string): WorkflowDefinition | undefined {
  return _registry.get(kind);
}

/** All registered kind strings. Useful for cron dispatch and admin tooling. */
export function listWorkflowKinds(): readonly string[] {
  return Array.from(_registry.keys());
}

// ---------------------------------------------------------------------------
// Default retry policy
// ---------------------------------------------------------------------------

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 60_000,
};
