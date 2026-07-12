/**
 * Agent Registry Types
 *
 * Shared contract for skill and tool definitions. Used by SKILL_REGISTRY,
 * TOOL_REGISTRY, and the DB sync script. Keep this file free of runtime
 * dependencies — it is imported by both server code and the sync script.
 */

import type { BooleanEntitlement } from '@/lib/entitlements/registry';
import type { SkillLifecycle } from './lifecycle';

// Matches the skillKindEnum values in enums.ts
export type SkillKind = 'vertical_agent' | 'tool' | 'style';

export type { SkillLifecycle };

/**
 * A skill definition as it exists in code.
 * The DB-side mirror is `skills_catalog` (agents.ts).
 */
export interface SkillDefinition {
  /** Unique slug — also the DB primary key. */
  readonly id: string;
  /** Human-readable name shown in admin UI. */
  readonly name: string;
  /** Short description of what this skill does. */
  readonly description: string;
  /** Taxonomy kind — drives admin filtering and future harness routing. */
  readonly kind: SkillKind;
  /** Semver string — stored on retouch_jobs.style_version for correlating prompt revisions. */
  readonly version: string;
  /**
   * Lifecycle stage for staged rollout (JOV-3944).
   * Defaults to `ga` for registry skills; compiled playbooks start as `draft`.
   */
  readonly lifecycle?: SkillLifecycle;
  /**
   * Version pointer served at invocation time. Rollback = flip this field
   * without deleting historical version rows.
   */
  readonly activeVersion?: string;
  /** Entitlement key that gates access. */
  readonly entitlement: BooleanEntitlement;
  /** Model identifier used for inference (e.g. 'google/gemini-2.5-flash-image'). */
  readonly model: string;
  /** Path to the style/system prompt markdown, relative to repo root. Null for tool skills. */
  readonly promptPath?: string;
  /** Arbitrary key/value metadata stored in skills_catalog.metadata jsonb column. */
  readonly metadata: Record<string, string>;
}

/**
 * A tool definition as it exists in code.
 * The DB-side mirror is `tools_catalog` (agents.ts).
 */
export interface ToolDefinition extends SkillDefinition {
  readonly kind: 'tool';
  /** Path to the Zod input schema, relative to repo root. */
  readonly inputSchemaZodPath?: string;
  /** Path to the Zod output schema, relative to repo root. */
  readonly outputSchemaZodPath?: string;
}
