import { sql as drizzleSql } from 'drizzle-orm';
import {
  type AnyPgColumn,
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
import { chatConversations } from './chat';
import { discogReleases } from './content';
import {
  releaseTaskPriorityEnum,
  releaseTaskStatusEnum,
  taskAgentStatusEnum,
  taskAssigneeKindEnum,
} from './enums';
import { creatorProfiles } from './profiles';
import { releaseTaskTemplateItems } from './release-tasks';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    taskNumber: integer('task_number').notNull(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: releaseTaskStatusEnum('status').notNull().default('todo'),
    priority: releaseTaskPriorityEnum('priority').notNull().default('medium'),
    assigneeKind: taskAssigneeKindEnum('assignee_kind')
      .notNull()
      .default('human'),
    assigneeUserId: text('assignee_user_id'),
    agentType: text('agent_type'),
    agentStatus: taskAgentStatusEnum('agent_status').notNull().default('idle'),
    agentInput: jsonb('agent_input')
      .$type<Record<string, unknown>>()
      .default({}),
    agentOutput: jsonb('agent_output')
      .$type<Record<string, unknown>>()
      .default({}),
    agentError: text('agent_error'),
    releaseId: uuid('release_id').references(() => discogReleases.id, {
      onDelete: 'set null',
    }),
    /**
     * Durable work-record link for a chat conversation (JOV-4514). At most
     * one task per conversation, enforced by the partial unique index below.
     */
    conversationId: uuid('conversation_id').references(
      () => chatConversations.id,
      {
        onDelete: 'cascade',
      }
    ),
    parentTaskId: uuid('parent_task_id').references(
      (): AnyPgColumn => tasks.id,
      {
        onDelete: 'set null',
      }
    ),
    category: text('category'),
    dueAt: timestamp('due_at'),
    scheduledFor: timestamp('scheduled_for'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    /**
     * Archived lifecycle marker. Archived tasks are filtered out of active
     * chat/task surfaces regardless of status (JOV-4514).
     */
    archivedAt: timestamp('archived_at'),
    position: integer('position').notNull().default(0),
    deletedAt: timestamp('deleted_at'),
    sourceTemplateId: uuid('source_template_id').references(
      () => releaseTaskTemplateItems.id,
      { onDelete: 'set null' }
    ),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    mutationVersion: integer('mutation_version').notNull().default(1),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    creatorTaskNumberUnique: uniqueIndex('tasks_creator_task_number_unique').on(
      table.creatorProfileId,
      table.taskNumber
    ),
    creatorStatusPriorityDueIndex: index(
      'tasks_creator_status_priority_due_idx'
    ).on(table.creatorProfileId, table.status, table.priority, table.dueAt),
    creatorPositionIndex: index('tasks_creator_position_idx').on(
      table.creatorProfileId,
      table.position
    ),
    releaseIndex: index('tasks_release_idx')
      .on(table.releaseId)
      .where(drizzleSql`release_id IS NOT NULL AND deleted_at IS NULL`),
    conversationIdUnique: uniqueIndex('tasks_conversation_id_unique')
      .on(table.conversationId)
      .where(drizzleSql`${table.conversationId} IS NOT NULL`),
    creatorAgentStatusIndex: index('tasks_creator_agent_status_idx')
      .on(table.creatorProfileId, table.agentStatus)
      .where(drizzleSql`deleted_at IS NULL`),
  })
);

export const insertTaskSchema = createInsertSchema(tasks);
export const selectTaskSchema = createSelectSchema(tasks);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
