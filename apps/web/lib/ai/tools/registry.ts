import type { ZodTypeAny, z } from 'zod';

/**
 * Tool registry ABI.
 *
 * Every agent tool registers here with a stable slug + version and a
 * fully-typed Zod input/output contract. Tools are Anthropic-tool-use
 * shaped (input can be serialized to JSON Schema via zod-to-json-schema)
 * so we can later swap the hardcoded release-launch sequence for
 * Sonnet-driven tool-use orchestration without a rewrite.
 */

export type ToolSafetyClass =
  | 'readonly' // reads only, no side effects
  | 'writes-user-data' // mutates user-scoped data
  | 'spends-money'; // calls a paid provider (LLM, image gen)

export interface ToolRetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs: number;
}

export interface ToolContext {
  /** Parent agent_runs row ID. Tool writes step rows under this. */
  readonly runId: string;
  /** Authenticated user from the run row — NEVER from client input. */
  readonly userId: string;
  /** Optional profile context, when the run is profile-scoped. */
  readonly profileId?: string | null;
  /** Optional release context, when the run is release-scoped. */
  readonly releaseId?: string | null;
  /** Attempt number for this step invocation (1-indexed). */
  readonly attempt: number;
}

export interface ToolUsageRecord {
  /** Actual cost in cents, billed to the user's monthly usage. */
  readonly costCents: number;
  readonly model?: string;
  readonly tokenIn?: number;
  readonly tokenOut?: number;
  readonly imageCount?: number;
}

export interface ToolHandlerResult<O> {
  readonly output: O;
  readonly usage: ToolUsageRecord;
}

export interface Tool<
  IS extends ZodTypeAny = ZodTypeAny,
  OS extends ZodTypeAny = ZodTypeAny,
> {
  /** Stable identity including version — e.g. 'album-art.v1'. */
  readonly slug: string;
  /** Semver version. Bump on breaking prompt/contract changes. */
  readonly version: string;
  /** Human-readable description shown in tool-use payloads. */
  readonly description: string;
  readonly inputSchema: IS;
  readonly outputSchema: OS;
  /**
   * CEILING estimate of the cost of this call. Must not underestimate.
   * Reservation system relies on this to pre-authorize spend.
   */
  readonly costEstimateCents: (input: z.infer<IS>) => number;
  readonly retryPolicy: ToolRetryPolicy;
  readonly safetyClass: ToolSafetyClass;
  /** Per-call hard timeout. */
  readonly timeoutMs: number;
  readonly handler: (
    ctx: ToolContext,
    input: z.infer<IS>
  ) => Promise<ToolHandlerResult<z.infer<OS>>>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY = new Map<string, Tool>();

export function registerTool<IS extends ZodTypeAny, OS extends ZodTypeAny>(
  tool: Tool<IS, OS>
): Tool<IS, OS> {
  if (REGISTRY.has(tool.slug)) {
    throw new Error(`Tool already registered: ${tool.slug}`);
  }
  REGISTRY.set(tool.slug, tool as unknown as Tool);
  return tool;
}

export function getTool(slug: string): Tool | undefined {
  return REGISTRY.get(slug);
}

export function requireTool(slug: string): Tool {
  const tool = REGISTRY.get(slug);
  if (!tool) throw new Error(`Unknown tool: ${slug}`);
  return tool;
}

export function listTools(): readonly Tool[] {
  return Array.from(REGISTRY.values());
}
