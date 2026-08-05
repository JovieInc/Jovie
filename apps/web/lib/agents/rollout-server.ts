import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  skillRolloutAssignments,
  skillsCatalog,
  skillsCatalogVersions,
} from '@/lib/db/schema/agents';
import { normalizeSkillLifecycleState } from './lifecycle';
import { resolveSkillRollout, type SkillRolloutAssignment } from './rollout';

/**
 * Resolve a catalog skill for a signed-in user. Assignments are inserted once
 * and then reused even when operators change rollout JSONB or active versions.
 * The caller still performs the normal entitlement check for the selected
 * skill/version; rollout never grants an entitlement.
 */
export async function resolveSkillVersionForUser(input: {
  readonly skillId: string;
  readonly userId: string;
}): Promise<{
  readonly version: string;
  readonly cohort: string;
  readonly assignment: SkillRolloutAssignment;
  readonly lifecycle: ReturnType<
    typeof normalizeSkillLifecycleState
  >['lifecycle'];
}> {
  const [catalog] = await db
    .select()
    .from(skillsCatalog)
    .where(eq(skillsCatalog.id, input.skillId))
    .limit(1);
  if (!catalog) throw new Error(`Unknown skill "${input.skillId}"`);

  const [existing] = await db
    .select()
    .from(skillRolloutAssignments)
    .where(
      and(
        eq(skillRolloutAssignments.skillId, input.skillId),
        eq(skillRolloutAssignments.userId, input.userId)
      )
    )
    .limit(1);
  const state = normalizeSkillLifecycleState(catalog);
  const available = await db
    .select({ version: skillsCatalogVersions.version })
    .from(skillsCatalogVersions)
    .where(eq(skillsCatalogVersions.skillId, input.skillId));
  const resolved = resolveSkillRollout({
    ...state,
    skillId: input.skillId,
    userId: input.userId,
    rollout: catalog.rollout,
    existingAssignment: existing ?? null,
    availableVersions: available.map(row => row.version),
  });

  if (!existing && resolved.lifecycle !== 'disabled') {
    await db
      .insert(skillRolloutAssignments)
      .values({
        skillId: input.skillId,
        userId: input.userId,
        cohort: resolved.assignment.cohort,
        skillVersion: resolved.assignment.skillVersion,
        bucket: resolved.assignment.bucket,
      })
      .onConflictDoNothing();
  }
  return {
    version: resolved.version,
    cohort: resolved.assignment.cohort,
    assignment: resolved.assignment,
    lifecycle: resolved.lifecycle,
  };
}
