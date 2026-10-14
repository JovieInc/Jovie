import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

export const DOGFOOD_ACTOR_KINDS = [
  'agent',
  'external_human',
  'internal_human',
] as const;

export const DOGFOOD_PRODUCTS = ['jov', 'lyb', 'ovie'] as const;
export type DogfoodProduct = (typeof DOGFOOD_PRODUCTS)[number];

export const DOGFOOD_CHANNELS = ['email', 'imessage', 'sms', 'x_dm'] as const;

export const DOGFOOD_TIERS = ['advisor', 'alpha', 'beta'] as const;

export const DOGFOOD_SIGNAL_STATES = [
  'calibrating',
  'consented',
  'invited',
  'paused',
  'qualified',
  'retired',
] as const;
export type DogfoodSignalState = (typeof DOGFOOD_SIGNAL_STATES)[number];

export const DOGFOOD_MODES = ['customer_control', 'early_access'] as const;
export type DogfoodMode = (typeof DOGFOOD_MODES)[number];

export interface DogfoodConsent {
  readonly grantedAt: string | null;
  readonly scope: readonly string[];
  readonly source: string | null;
  readonly revokedAt: string | null;
}

export interface DogfoodCalibration {
  readonly knownGoodPassed: boolean;
  readonly knownBrokenPassed: boolean;
  readonly actionableReports: number;
  readonly feedbackQualityScore: number | null;
  readonly completedAt: string | null;
}

export interface DogfoodContactBudget {
  readonly maxContacts: number;
  readonly windowDays: number;
}

export const dogfooders = pgTable(
  'dogfooders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorKey: text('actor_key').notNull(),
    actorKind: text('actor_kind', { enum: DOGFOOD_ACTOR_KINDS }).notNull(),
    displayName: text('display_name').notNull(),
    tier: text('tier', { enum: DOGFOOD_TIERS }),
    products: text('products').array().notNull().default([]),
    channel: text('channel', { enum: DOGFOOD_CHANNELS }),
    handle: text('handle'),
    jovieUserId: uuid('jovie_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    consent: jsonb('consent').$type<DogfoodConsent>().notNull(),
    signalState: text('signal_state', {
      enum: DOGFOOD_SIGNAL_STATES,
    })
      .notNull()
      .default('invited'),
    vouchedBy: text('vouched_by', { enum: ['tim'] as const }),
    calibration: jsonb('calibration').$type<DogfoodCalibration>(),
    contactBudget: jsonb('contact_budget')
      .$type<DogfoodContactBudget>()
      .notNull()
      .default({ maxContacts: 1, windowDays: 7 }),
    scopes: text('scopes').array().notNull().default([]),
    allowedModes: text('allowed_modes')
      .array()
      .notNull()
      .default(['customer_control', 'early_access']),
    agentSurfaces: text('agent_surfaces').array().notNull().default([]),
    membershipExpiresAt: timestamp('membership_expires_at', {
      withTimezone: true,
    }),
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
    lastFeedbackAt: timestamp('last_feedback_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('dogfooders_actor_key_unique').on(table.actorKey),
    uniqueIndex('dogfooders_jovie_user_unique')
      .on(table.jovieUserId)
      .where(drizzleSql`${table.jovieUserId} IS NOT NULL`),
    index('dogfooders_state_idx').on(table.signalState),
    check(
      'dogfooders_products_check',
      drizzleSql`cardinality(${table.products}) > 0 AND ${table.products} <@ ARRAY['jov', 'lyb', 'ovie']::text[]`
    ),
    check(
      'dogfooders_allowed_modes_check',
      drizzleSql`cardinality(${table.allowedModes}) > 0 AND ${table.allowedModes} <@ ARRAY['customer_control', 'early_access']::text[]`
    ),
    check(
      'dogfooders_agent_surfaces_check',
      drizzleSql`${table.agentSurfaces} <@ ARRAY['api', 'browser', 'cli', 'cloud', 'local', 'mcp', 'native']::text[]`
    ),
    check(
      'dogfooders_actor_tier_check',
      drizzleSql`(${table.actorKind} = 'agent' AND ${table.tier} IS NULL) OR (${table.actorKind} <> 'agent')`
    ),
  ]
);

export const DOGFOOD_BINDING_STATUSES = ['active', 'revoked'] as const;

export const dogfooderBindings = pgTable(
  'dogfooder_bindings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dogfooderId: uuid('dogfooder_id')
      .notNull()
      .references(() => dogfooders.id, { onDelete: 'cascade' }),
    product: text('product', { enum: DOGFOOD_PRODUCTS }).notNull(),
    accountSubject: text('account_subject').notNull(),
    sessionSubject: text('session_subject'),
    deviceSubject: text('device_subject'),
    bindingKey: text('binding_key').notNull(),
    status: text('status', { enum: DOGFOOD_BINDING_STATUSES })
      .notNull()
      .default('active'),
    authorizedAt: timestamp('authorized_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  table => [
    uniqueIndex('dogfooder_bindings_key_unique').on(table.bindingKey),
    uniqueIndex('dogfooder_bindings_account_unique')
      .on(table.product, table.accountSubject)
      .where(drizzleSql`${table.sessionSubject} IS NULL`),
    uniqueIndex('dogfooder_bindings_session_unique')
      .on(table.product, table.sessionSubject)
      .where(drizzleSql`${table.sessionSubject} IS NOT NULL`),
    index('dogfooder_bindings_account_idx').on(
      table.product,
      table.accountSubject
    ),
    index('dogfooder_bindings_dogfooder_idx').on(table.dogfooderId),
  ]
);

export type Dogfooder = typeof dogfooders.$inferSelect;
export type DogfooderBinding = typeof dogfooderBindings.$inferSelect;
