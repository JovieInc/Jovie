/**
 * sync-skills-catalog.ts
 *
 * Idempotent upsert script. Walks SKILL_REGISTRY and upserts into
 * skills_catalog + tools_catalog (for kind='tool' entries — empty in v1).
 *
 * Wired into package.json postbuild so it runs on every deploy.
 * Safe to re-run: second run produces no diff (upsert on PK with onConflictDoUpdate).
 *
 * Usage:
 *   doppler run --project jovie-web --config dev -- tsx apps/web/scripts/sync-skills-catalog.ts
 */

import { sql as drizzleSql } from 'drizzle-orm';
import { SKILL_REGISTRY } from '@/lib/agents/registry';
import type { SkillDefinition } from '@/lib/agents/types';
import { db } from '@/lib/db';
import { skillsCatalog, toolsCatalog } from '@/lib/db/schema/agents';

async function syncSkillsCatalog(): Promise<void> {
  const skills = Object.values(SKILL_REGISTRY) as SkillDefinition[];
  const toolSkills = skills.filter(s => s.kind === 'tool');
  const nonToolSkills = skills.filter(s => s.kind !== 'tool');

  if (nonToolSkills.length > 0) {
    await db
      .insert(skillsCatalog)
      .values(
        nonToolSkills.map(skill => ({
          id: skill.id,
          name: skill.name,
          description: skill.description ?? null,
          kind: skill.kind,
          version: skill.version,
          entitlementRequired: skill.entitlement ?? null,
          model: skill.model ?? null,
          promptPath: skill.promptPath ?? null,
          metadata: skill.metadata,
          updatedAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: skillsCatalog.id,
        set: {
          name: drizzleSql`excluded.name`,
          description: drizzleSql`excluded.description`,
          kind: drizzleSql`excluded.kind`,
          version: drizzleSql`excluded.version`,
          entitlementRequired: drizzleSql`excluded.entitlement_required`,
          model: drizzleSql`excluded.model`,
          promptPath: drizzleSql`excluded.prompt_path`,
          metadata: drizzleSql`excluded.metadata`,
          updatedAt: drizzleSql`excluded.updated_at`,
        },
      });
  }

  if (toolSkills.length > 0) {
    await db
      .insert(toolsCatalog)
      .values(
        toolSkills.map(skill => ({
          id: skill.id,
          name: skill.name,
          description: skill.description ?? null,
          kind: 'tool' as const,
          version: skill.version,
          entitlementRequired: skill.entitlement ?? null,
          model: skill.model ?? null,
          promptPath: skill.promptPath ?? null,
          metadata: skill.metadata,
          updatedAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: toolsCatalog.id,
        set: {
          name: drizzleSql`excluded.name`,
          description: drizzleSql`excluded.description`,
          kind: drizzleSql`excluded.kind`,
          version: drizzleSql`excluded.version`,
          entitlementRequired: drizzleSql`excluded.entitlement_required`,
          model: drizzleSql`excluded.model`,
          promptPath: drizzleSql`excluded.prompt_path`,
          metadata: drizzleSql`excluded.metadata`,
          updatedAt: drizzleSql`excluded.updated_at`,
        },
      });
  }

  console.log(
    `[sync-skills-catalog] upserted ${nonToolSkills.length} skill(s), ${toolSkills.length} tool(s)`
  );
}

// Skip gracefully when DATABASE_URL is unavailable (e.g., lint-only CI builds).
// Real deploys (Vercel, db:web:migrate) always have DATABASE_URL injected by Doppler.
if (!process.env.DATABASE_URL) {
  console.log(
    '[sync-skills-catalog] DATABASE_URL not set — skipping catalog sync (no-op in lint/type-check CI)'
  );
  process.exit(0);
}

syncSkillsCatalog()
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('[sync-skills-catalog] failed:', err);
    process.exit(1);
  });
