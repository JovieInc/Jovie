import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { discogReleases } from './content';
import {
  customTaskTriageStatusEnum,
  releaseSkillClusterStatusEnum,
  releaseTaskAiSkillStatusEnum,
  releaseTaskAssigneeTypeEnum,
  releaseTaskPriorityEnum,
  releaseTaskStatusEnum,
} from './enums';
import { creatorProfiles } from './profiles';

// ─── Release Task Templates ─────────────────────────────────────────
// Per-artist customizable template (Phase 2).
// Phase 1 uses a TypeScript constant; these tables exist for future use.

export const releaseTaskTemplates = pgTable(
  'release_task_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'cascade' }
    ),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorDefaultUnique: uniqueIndex(
      'release_task_templates_creator_default_unique'
    )
      .on(table.creatorProfileId)
      .where(drizzleSql`is_default = true`),
  })
);

export const releaseTaskTemplateItems = pgTable(
  'release_task_template_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => releaseTaskTemplates.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    explainerText: text('explainer_text'),
    learnMoreUrl: text('learn_more_url'),
    videoUrl: text('video_url'),
    category: text('category').notNull(),
    defaultAssigneeType: releaseTaskAssigneeTypeEnum('default_assignee_type')
      .notNull()
      .default('human'),
    defaultAiWorkflowId: text('default_ai_workflow_id'),
    defaultPriority: releaseTaskPriorityEnum('default_priority')
      .notNull()
      .default('medium'),
    defaultDueDaysOffset: integer('default_due_days_offset'),
    position: integer('position').notNull().default(0),
    isEnabled: boolean('is_enabled').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    templateIdIndex: index('release_task_template_items_template_id_idx').on(
      table.templateId
    ),
  })
);

// ─── Release Tasks (instantiated per release) ───────────────────────

export const releaseTasks = pgTable(
  'release_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    templateItemId: uuid('template_item_id').references(
      () => releaseTaskTemplateItems.id,
      { onDelete: 'set null' }
    ),
    title: text('title').notNull(),
    description: text('description'),
    explainerText: text('explainer_text'),
    learnMoreUrl: text('learn_more_url'),
    videoUrl: text('video_url'),
    category: text('category'),
    status: releaseTaskStatusEnum('status').notNull().default('todo'),
    priority: releaseTaskPriorityEnum('priority').notNull().default('medium'),
    position: integer('position').notNull().default(0),
    assigneeType: releaseTaskAssigneeTypeEnum('assignee_type')
      .notNull()
      .default('human'),
    assigneeUserId: text('assignee_user_id'),
    aiWorkflowId: text('ai_workflow_id'),
    dueDaysOffset: integer('due_days_offset'),
    dueDate: timestamp('due_date'),
    completedAt: timestamp('completed_at'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    releaseStatusIndex: index('release_tasks_release_status_idx').on(
      table.releaseId,
      table.status
    ),
    releasePositionIndex: index('release_tasks_release_position_idx').on(
      table.releaseId,
      table.position
    ),
    creatorProfileIndex: index('release_tasks_creator_profile_idx').on(
      table.creatorProfileId
    ),
    dueDateIndex: index('release_tasks_due_date_idx')
      .on(table.dueDate)
      .where(drizzleSql`due_date IS NOT NULL`),
  })
);

// ─── Release Skill Clusters (Phase 1) ──────────────────────────────
// User-visible filter groupings + roadmap tracking for AI-skill work.

export const releaseSkillClusters = pgTable('release_skill_clusters', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  status: releaseSkillClusterStatusEnum('status').notNull().default('planned'),
  demandScore: integer('demand_score').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Release Task Catalog (Phase 1) ────────────────────────────────
// Canonical atomic release-task definitions. Selector reads from here;
// per-release work is materialized into release_task_snapshots.

export const releaseTaskCatalog = pgTable(
  'release_task_catalog',
  {
    slug: text('slug').primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    clusterId: integer('cluster_id').references(() => releaseSkillClusters.id, {
      onDelete: 'set null',
    }),
    shortDescription: text('short_description'),
    priority: releaseTaskPriorityEnum('priority').notNull().default('medium'),
    // flowStage expressed as day offset from release (e.g. -28, 0, 7)
    flowStageDaysOffset: integer('flow_stage_days_offset'),
    dependencies: text('dependencies').array(),
    applicabilityRules: jsonb('applicability_rules').$type<unknown>().notNull(),
    applicabilityRulesVersion: integer('applicability_rules_version')
      .notNull()
      .default(1),
    platforms: jsonb('platforms').$type<Record<string, unknown>>().default({}),
    sourceLinks: jsonb('source_links')
      .$type<Record<string, string>>()
      .default({}),
    assigneeType: releaseTaskAssigneeTypeEnum('assignee_type')
      .notNull()
      .default('human'),
    aiSkillStatus: releaseTaskAiSkillStatusEnum('ai_skill_status')
      .notNull()
      .default('none'),
    aiSkillId: text('ai_skill_id'),
    catalogVersion: integer('catalog_version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    clusterIdIndex: index('release_task_catalog_cluster_id_idx').on(
      table.clusterId
    ),
  })
);

// ─── Release Task Snapshots (Phase 1) ──────────────────────────────
// Denormalized copy of a catalog row at release-instantiation time.
// In-flight releases render from here so catalog edits do not retro-rewrite.

export const releaseTaskSnapshots = pgTable(
  'release_task_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    catalogSlug: text('catalog_slug').notNull(),
    catalogVersion: integer('catalog_version').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    clusterId: integer('cluster_id'),
    shortDescription: text('short_description'),
    priority: releaseTaskPriorityEnum('priority').notNull().default('medium'),
    flowStageDaysOffset: integer('flow_stage_days_offset'),
    assigneeType: releaseTaskAssigneeTypeEnum('assignee_type')
      .notNull()
      .default('human'),
    aiSkillId: text('ai_skill_id'),
    aiSkillStatus: releaseTaskAiSkillStatusEnum('ai_skill_status')
      .notNull()
      .default('none'),
    reasons: text('reasons').array(),
    score: real('score'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    releaseIdIndex: index('release_task_snapshots_release_id_idx').on(
      table.releaseId
    ),
  })
);

// ─── Custom Task Telemetry (Phase 1) ───────────────────────────────
// Free-form user-added tasks. Classifier routes to cluster or admin triage.

export const customTaskTelemetry = pgTable(
  'custom_task_telemetry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'set null',
    }),
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'set null' }
    ),
    userText: text('user_text').notNull(),
    normalizedText: text('normalized_text').notNull(),
    suggestedClusterSlug: text('suggested_cluster_slug'),
    classifierConfidence: real('classifier_confidence'),
    triageStatus: customTaskTriageStatusEnum('triage_status')
      .notNull()
      .default('pending_review'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    triageStatusIndex: index('custom_task_telemetry_triage_status_idx').on(
      table.triageStatus
    ),
    normalizedTextIndex: index('custom_task_telemetry_normalized_text_idx').on(
      table.normalizedText
    ),
  })
);

// ─── Zod Schemas & Types ────────────────────────────────────────────

export const insertReleaseTaskTemplateSchema =
  createInsertSchema(releaseTaskTemplates);
export const selectReleaseTaskTemplateSchema =
  createSelectSchema(releaseTaskTemplates);
export type ReleaseTaskTemplate = typeof releaseTaskTemplates.$inferSelect;
export type NewReleaseTaskTemplate = typeof releaseTaskTemplates.$inferInsert;

export const insertReleaseTaskTemplateItemSchema = createInsertSchema(
  releaseTaskTemplateItems
);
export const selectReleaseTaskTemplateItemSchema = createSelectSchema(
  releaseTaskTemplateItems
);
export type ReleaseTaskTemplateItem =
  typeof releaseTaskTemplateItems.$inferSelect;
export type NewReleaseTaskTemplateItem =
  typeof releaseTaskTemplateItems.$inferInsert;

export const insertReleaseTaskSchema = createInsertSchema(releaseTasks);
export const selectReleaseTaskSchema = createSelectSchema(releaseTasks);
export type ReleaseTask = typeof releaseTasks.$inferSelect;
export type NewReleaseTask = typeof releaseTasks.$inferInsert;

export const insertReleaseSkillClusterSchema =
  createInsertSchema(releaseSkillClusters);
export const selectReleaseSkillClusterSchema =
  createSelectSchema(releaseSkillClusters);
export type ReleaseSkillCluster = typeof releaseSkillClusters.$inferSelect;
export type NewReleaseSkillCluster = typeof releaseSkillClusters.$inferInsert;

export const insertReleaseTaskCatalogSchema =
  createInsertSchema(releaseTaskCatalog);
export const selectReleaseTaskCatalogSchema =
  createSelectSchema(releaseTaskCatalog);
export type ReleaseTaskCatalog = typeof releaseTaskCatalog.$inferSelect;
export type NewReleaseTaskCatalog = typeof releaseTaskCatalog.$inferInsert;

export const insertReleaseTaskSnapshotSchema =
  createInsertSchema(releaseTaskSnapshots);
export const selectReleaseTaskSnapshotSchema =
  createSelectSchema(releaseTaskSnapshots);
export type ReleaseTaskSnapshot = typeof releaseTaskSnapshots.$inferSelect;
export type NewReleaseTaskSnapshot = typeof releaseTaskSnapshots.$inferInsert;

export const insertCustomTaskTelemetrySchema =
  createInsertSchema(customTaskTelemetry);
export const selectCustomTaskTelemetrySchema =
  createSelectSchema(customTaskTelemetry);
export type CustomTaskTelemetry = typeof customTaskTelemetry.$inferSelect;
export type NewCustomTaskTelemetry = typeof customTaskTelemetry.$inferInsert;
