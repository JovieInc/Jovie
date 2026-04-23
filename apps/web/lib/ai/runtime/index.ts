import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql, eq } from 'drizzle-orm';
import {
  commitBudget,
  releaseBudget,
  reserveBudget,
} from '@/lib/agent-budget/check-budget';
import {
  fleetCapAvailable,
  isRuntimeDisabled,
} from '@/lib/agent-budget/fleet-cap';
import { requireTool, type ToolContext } from '@/lib/ai/tools/registry';
import { db } from '@/lib/db';
import { agentRunSteps, agentRuns } from '@/lib/db/schema/agent-runs';

/**
 * Agent runtime.
 *
 * Exposes `callTool(ctx, slug, input)` — the only way tools should be
 * invoked from a durable parent run. Handles:
 *   - fleet-cap and kill-switch checks
 *   - per-call budget reservation (atomic via user_monthly_usage)
 *   - step row creation + completion in agent_run_steps
 *   - usage recording on the parent agent_runs row
 *   - Sentry spans with tool_slug, cost, model, user_id (hashed)
 */

export class BudgetBlockedError extends Error {
  constructor(
    message: string,
    readonly capCents: number
  ) {
    super(message);
    this.name = 'BudgetBlockedError';
  }
}

export class FleetCapError extends Error {
  constructor(
    message: string,
    readonly capCents: number,
    readonly spentTodayCents: number
  ) {
    super(message);
    this.name = 'FleetCapError';
  }
}

export class RuntimeDisabledError extends Error {
  constructor() {
    super('Agent runtime disabled by AGENT_RUNTIME_DISABLED env');
    this.name = 'RuntimeDisabledError';
  }
}

function hashUserId(userId: string): string {
  // Simple non-cryptographic hash for Sentry attribute (PII scrubbing).
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return `u_${(hash >>> 0).toString(36)}`;
}

export async function callTool<Input, Output>(
  ctx: ToolContext,
  slug: string,
  input: Input
): Promise<Output> {
  if (isRuntimeDisabled()) throw new RuntimeDisabledError();

  const tool = requireTool(slug);

  // Validate input against the tool's schema. Throws ZodError on bad input.
  const parsedInput = tool.inputSchema.parse(input);
  const estimatedCents = tool.costEstimateCents(parsedInput);

  // Fleet cap: fails closed if breached.
  const fleet = await fleetCapAvailable(estimatedCents);
  if (!fleet.ok) {
    throw new FleetCapError(
      'Global daily AI spend ceiling reached',
      fleet.capCents,
      fleet.spentTodayCents
    );
  }

  // Per-user reservation.
  const reservation = await reserveBudget(ctx.userId, estimatedCents);
  if (!reservation.ok) {
    throw new BudgetBlockedError(
      `Budget ${reservation.reason}`,
      reservation.capCents
    );
  }

  const { yearMonth } = reservation;

  // Create the step row.
  const [step] = await db
    .insert(agentRunSteps)
    .values({
      runId: ctx.runId,
      toolSlug: tool.slug,
      toolVersion: tool.version,
      status: 'running',
      input: parsedInput as Record<string, unknown>,
      attemptCount: ctx.attempt,
      startedAt: new Date(),
    })
    .returning();

  if (!step) throw new Error('Failed to create agent_run_steps row');

  return await Sentry.startSpan(
    {
      op: 'ai.tool',
      name: `tool:${tool.slug}`,
      attributes: {
        'tool.slug': tool.slug,
        'tool.version': tool.version,
        'tool.safetyClass': tool.safetyClass,
        'agent.run_id': ctx.runId,
        'user.hashed': hashUserId(ctx.userId),
        'budget.estimated_cents': estimatedCents,
      },
    },
    async span => {
      try {
        const result = await tool.handler(ctx, parsedInput);
        // Validate output. Contract violation = fail the step, keep the reservation reconciled as zero-spend.
        const parsedOutput = tool.outputSchema.parse(result.output);

        const actualCents = Math.max(0, Math.round(result.usage.costCents));
        span.setAttribute('tool.cost_cents', actualCents);
        if (result.usage.model)
          span.setAttribute('tool.model', result.usage.model);

        // Mark step complete.
        await db
          .update(agentRunSteps)
          .set({
            status: 'completed',
            output: parsedOutput as Record<string, unknown>,
            costCents: actualCents,
            model: result.usage.model,
            tokenIn: result.usage.tokenIn,
            tokenOut: result.usage.tokenOut,
            imageCount: result.usage.imageCount,
            endedAt: new Date(),
          })
          .where(eq(agentRunSteps.id, step.id));

        // Bump parent run cost atomically.
        await db
          .update(agentRuns)
          .set({
            costCents: drizzleSql`${agentRuns.costCents} + ${actualCents}`,
          })
          .where(eq(agentRuns.id, ctx.runId));

        // Commit budget: reserved -> spent with actual.
        await commitBudget(ctx.userId, yearMonth, estimatedCents, actualCents);

        return parsedOutput as Output;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(agentRunSteps)
          .set({
            status: 'failed',
            error: message,
            endedAt: new Date(),
          })
          .where(eq(agentRunSteps.id, step.id));

        // Release the reservation; no spend recorded.
        await releaseBudget(ctx.userId, yearMonth, estimatedCents);
        throw err;
      }
    }
  );
}

/**
 * Increment the parent agent_run cost by `cents`. Useful for billing a
 * run-level surcharge outside tool calls (rarely needed — prefer per-tool).
 */
export async function addRunCost(runId: string, cents: number): Promise<void> {
  await db
    .update(agentRuns)
    .set({
      costCents: drizzleSql`${agentRuns.costCents} + ${cents}`,
    })
    .where(eq(agentRuns.id, runId));
}
