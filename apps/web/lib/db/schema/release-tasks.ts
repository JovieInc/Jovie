import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { discogReleases } from './content';
import {
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
