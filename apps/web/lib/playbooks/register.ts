/**
 * Register a compiled playbook skill into skills_catalog (JOV-3945).
 *
 * Draft skills update the head catalog row. Released lifecycles only append
 * a new versions row — never mutate the released snapshot in place.
 */

import { eq } from 'drizzle-orm';
import {
  DEFAULT_SKILL_LIFECYCLE,
  normalizeSkillLifecycleState,
  type SkillLifecycle,
} from '@/lib/agents/lifecycle';
import type { SkillDefinition } from '@/lib/agents/types';
import { db } from '@/lib/db';
import { skillsCatalog, skillsCatalogVersions } from '@/lib/db/schema/agents';

export interface RegisterCompiledSkillResult {
  readonly skillId: string;
  readonly version: string;
  readonly lifecycle: SkillLifecycle;
  readonly action: 'inserted' | 'updated-draft' | 'version-appended';
}

const RELEASED: ReadonlySet<SkillLifecycle> = new Set([
  'dogfood',
  'cohort',
  'ga',
  'deprecated',
]);

export async function registerCompiledSkill(
  skill: SkillDefinition,
  options?: {
    readonly db?: typeof db;
  }
): Promise<RegisterCompiledSkillResult> {
  const database = options?.db ?? db;
  const now = new Date();
  const normalized = normalizeSkillLifecycleState({
    version: skill.version,
    activeVersion: skill.activeVersion ?? skill.version,
    lifecycle: skill.lifecycle ?? 'draft',
  });

  // Always preserve the version snapshot (idempotent on skill_id+version).
  await database
    .insert(skillsCatalogVersions)
    .values({
      skillId: skill.id,
      version: normalized.version,
      name: skill.name,
      description: skill.description ?? null,
      kind: skill.kind,
      lifecycle: normalized.lifecycle,
      entitlementRequired: skill.entitlement ?? null,
      model: skill.model ?? null,
      promptPath: skill.promptPath ?? null,
      metadata: skill.metadata,
      createdAt: now,
    })
    .onConflictDoNothing();

  const existing = await database
    .select({
      id: skillsCatalog.id,
      lifecycle: skillsCatalog.lifecycle,
      version: skillsCatalog.version,
      activeVersion: skillsCatalog.activeVersion,
    })
    .from(skillsCatalog)
    .where(eq(skillsCatalog.id, skill.id))
    .limit(1);

  const head = existing[0];
  if (!head) {
    await database.insert(skillsCatalog).values({
      id: skill.id,
      name: skill.name,
      description: skill.description ?? null,
      kind: skill.kind,
      version: normalized.version,
      lifecycle: normalized.lifecycle,
      activeVersion: normalized.activeVersion,
      entitlementRequired: skill.entitlement ?? null,
      model: skill.model ?? null,
      promptPath: skill.promptPath ?? null,
      metadata: skill.metadata,
      updatedAt: now,
    });
    return {
      skillId: skill.id,
      version: normalized.version,
      lifecycle: normalized.lifecycle,
      action: 'inserted',
    };
  }

  const existingLifecycle = normalizeSkillLifecycleState({
    version: head.version,
    activeVersion: head.activeVersion,
    lifecycle: head.lifecycle ?? DEFAULT_SKILL_LIFECYCLE,
  }).lifecycle;

  if (RELEASED.has(existingLifecycle)) {
    // Released head stays put; only the versions table grows.
    return {
      skillId: skill.id,
      version: normalized.version,
      lifecycle: existingLifecycle,
      action: 'version-appended',
    };
  }

  await database
    .update(skillsCatalog)
    .set({
      name: skill.name,
      description: skill.description ?? null,
      kind: skill.kind,
      version: normalized.version,
      lifecycle: 'draft',
      activeVersion: normalized.version,
      entitlementRequired: skill.entitlement ?? null,
      model: skill.model ?? null,
      promptPath: skill.promptPath ?? null,
      metadata: skill.metadata,
      updatedAt: now,
    })
    .where(eq(skillsCatalog.id, skill.id));

  return {
    skillId: skill.id,
    version: normalized.version,
    lifecycle: 'draft',
    action: 'updated-draft',
  };
}
