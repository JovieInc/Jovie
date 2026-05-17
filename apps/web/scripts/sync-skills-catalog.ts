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

import { pathToFileURL } from 'node:url';
import { sql as drizzleSql } from 'drizzle-orm';
import { SKILL_REGISTRY } from '@/lib/agents/registry';
import type { SkillDefinition, ToolDefinition } from '@/lib/agents/types';
import { db } from '@/lib/db';
import { skillsCatalog, toolsCatalog } from '@/lib/db/schema/agents';
import { env } from '@/lib/env-server';

const skillCatalogChanged = drizzleSql`
  ${skillsCatalog.name} IS DISTINCT FROM excluded.name OR
  ${skillsCatalog.description} IS DISTINCT FROM excluded.description OR
  ${skillsCatalog.kind} IS DISTINCT FROM excluded.kind OR
  ${skillsCatalog.version} IS DISTINCT FROM excluded.version OR
  ${skillsCatalog.entitlementRequired} IS DISTINCT FROM excluded.entitlement_required OR
  ${skillsCatalog.model} IS DISTINCT FROM excluded.model OR
  ${skillsCatalog.promptPath} IS DISTINCT FROM excluded.prompt_path OR
  ${skillsCatalog.metadata} IS DISTINCT FROM excluded.metadata
`;

const toolCatalogChanged = drizzleSql`
  ${toolsCatalog.name} IS DISTINCT FROM excluded.name OR
  ${toolsCatalog.description} IS DISTINCT FROM excluded.description OR
  ${toolsCatalog.kind} IS DISTINCT FROM excluded.kind OR
  ${toolsCatalog.version} IS DISTINCT FROM excluded.version OR
  ${toolsCatalog.entitlementRequired} IS DISTINCT FROM excluded.entitlement_required OR
  ${toolsCatalog.model} IS DISTINCT FROM excluded.model OR
  ${toolsCatalog.promptPath} IS DISTINCT FROM excluded.prompt_path OR
  ${toolsCatalog.inputSchemaZodPath} IS DISTINCT FROM excluded.input_schema_zod_path OR
  ${toolsCatalog.outputSchemaZodPath} IS DISTINCT FROM excluded.output_schema_zod_path OR
  ${toolsCatalog.metadata} IS DISTINCT FROM excluded.metadata
`;

export async function syncSkillsCatalog(): Promise<void> {
  const now = new Date();
  const skills = Object.values(SKILL_REGISTRY) as SkillDefinition[];
  const toolSkills = skills.filter(
    (s): s is ToolDefinition => s.kind === 'tool'
  );
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
          updatedAt: now,
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
        setWhere: skillCatalogChanged,
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
          inputSchemaZodPath: skill.inputSchemaZodPath ?? null,
          outputSchemaZodPath: skill.outputSchemaZodPath ?? null,
          metadata: skill.metadata,
          updatedAt: now,
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
          inputSchemaZodPath: drizzleSql`excluded.input_schema_zod_path`,
          outputSchemaZodPath: drizzleSql`excluded.output_schema_zod_path`,
          metadata: drizzleSql`excluded.metadata`,
          updatedAt: drizzleSql`excluded.updated_at`,
        },
        setWhere: toolCatalogChanged,
      });
  }

  console.log(
    `[sync-skills-catalog] upserted ${nonToolSkills.length} skill(s), ${toolSkills.length} tool(s)`
  );
}

export async function main(): Promise<'skipped' | 'synced'> {
  // Skip gracefully when DATABASE_URL is unavailable (e.g., lint-only CI builds).
  // Real deploys (Vercel, db:web:migrate) always have DATABASE_URL injected by Doppler.
  if (!env.DATABASE_URL) {
    console.log(
      '[sync-skills-catalog] DATABASE_URL not set — skipping catalog sync (no-op in lint/type-check CI)'
    );
    return 'skipped';
  }

  await syncSkillsCatalog();
  return 'synced';
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('[sync-skills-catalog] failed:', err);
      process.exit(1);
    });
}
