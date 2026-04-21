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
import { users } from './auth';
import {
  productFunnelAlertStatusEnum,
  productFunnelEventTypeEnum,
  productSyntheticRunStatusEnum,
} from './enums';
import { creatorProfiles } from './profiles';

export interface ProductFunnelEventMetadata {
  [key: string]: unknown;
}

export interface ProductFunnelAlertPayload {
  [key: string]: unknown;
}

export interface ProductSyntheticRunDetails {
  [key: string]: unknown;
}

export const productFunnelEvents = pgTable(
  'product_funnel_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: productFunnelEventTypeEnum('event_type').notNull(),
    occurredAt: timestamp('occurred_at').defaultNow().notNull(),
    actorKey: text('actor_key').notNull(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    creatorProfileId: uuid('creator_profile_id').references(
      () => creatorProfiles.id,
      {
        onDelete: 'set null',
      }
    ),
    sessionId: text('session_id'),
    sourceSurface: text('source_surface'),
    sourceRoute: text('source_route'),
    isSynthetic: boolean('is_synthetic').default(false).notNull(),
    metadata: jsonb('metadata')
      .$type<ProductFunnelEventMetadata>()
      .default({})
      .notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    idempotencyKeyUnique: uniqueIndex(
      'product_funnel_events_idempotency_key_unique'
    ).on(table.idempotencyKey),
    eventOccurredAtIdx: index('product_funnel_events_event_occurred_at_idx').on(
      table.eventType,
      table.occurredAt
    ),
    eventSyntheticOccurredAtIdx: index(
      'product_funnel_events_event_synthetic_occurred_at_idx'
    ).on(table.eventType, table.isSynthetic, table.occurredAt),
    userIdIdx: index('product_funnel_events_user_id_idx').on(table.userId),
    creatorProfileIdIdx: index(
      'product_funnel_events_creator_profile_id_idx'
    ).on(table.creatorProfileId),
    sessionIdIdx: index('product_funnel_events_session_id_idx').on(
      table.sessionId
    ),
  })
);

export const productFunnelAlertStates = pgTable('product_funnel_alert_states', {
  ruleName: text('rule_name').primaryKey(),
  status: productFunnelAlertStatusEnum('status').default('ok').notNull(),
  lastEvaluatedAt: timestamp('last_evaluated_at'),
  lastTriggeredAt: timestamp('last_triggered_at'),
  lastRecoveredAt: timestamp('last_recovered_at'),
  consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
  lastPayload: jsonb('last_payload')
    .$type<ProductFunnelAlertPayload>()
    .default({})
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const productSyntheticRuns = pgTable(
  'product_synthetic_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    monitorKey: text('monitor_key').notNull(),
    status: productSyntheticRunStatusEnum('status')
      .default('running')
      .notNull(),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    finishedAt: timestamp('finished_at'),
    error: text('error'),
    details: jsonb('details')
      .$type<ProductSyntheticRunDetails>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    monitorStartedAtIdx: index(
      'product_synthetic_runs_monitor_started_at_idx'
    ).on(table.monitorKey, table.startedAt),
    statusStartedAtIdx: index(
      'product_synthetic_runs_status_started_at_idx'
    ).on(table.status, table.startedAt),
  })
);

export const insertProductFunnelEventSchema =
  createInsertSchema(productFunnelEvents);
export const selectProductFunnelEventSchema =
  createSelectSchema(productFunnelEvents);

export const insertProductFunnelAlertStateSchema = createInsertSchema(
  productFunnelAlertStates
);
export const selectProductFunnelAlertStateSchema = createSelectSchema(
  productFunnelAlertStates
);

export const insertProductSyntheticRunSchema =
  createInsertSchema(productSyntheticRuns);
export const selectProductSyntheticRunSchema =
  createSelectSchema(productSyntheticRuns);

export type ProductFunnelEvent = typeof productFunnelEvents.$inferSelect;
export type NewProductFunnelEvent = typeof productFunnelEvents.$inferInsert;

export type ProductFunnelAlertState =
  typeof productFunnelAlertStates.$inferSelect;
export type NewProductFunnelAlertState =
  typeof productFunnelAlertStates.$inferInsert;

export type ProductSyntheticRun = typeof productSyntheticRuns.$inferSelect;
export type NewProductSyntheticRun = typeof productSyntheticRuns.$inferInsert;
