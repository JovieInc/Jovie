import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';
import {
  profileApprovalEventEnum,
  profileApprovalStatusEnum,
  profileRiskyActionEnum,
} from './enums';
import { creatorProfiles } from './profiles';

/**
 * Owner-approval workflow for risky profile actions (JOV-6601).
 *
 * Non-owner team members (manager / assistant) must obtain owner approval
 * before executing actions that a hijacked account could weaponize, such as
 * changing link destinations or messaging fans. Requests live here; every
 * state transition is mirrored into `profileApprovalEvents` so approval,
 * rejection, expiry, and revocation stay auditable.
 */
export const profileActionApprovals = pgTable(
  'profile_action_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    action: profileRiskyActionEnum('action').notNull(),
    status: profileApprovalStatusEnum('status').notNull().default('pending'),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    decidedBy: uuid('decided_by').references(() => users.id),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    reason: text('reason'),
    expiresAt: timestamp('expires_at').notNull(),
    decidedAt: timestamp('decided_at'),
    consumedAt: timestamp('consumed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    profileIdx: index('idx_profile_action_approvals_profile').on(
      table.creatorProfileId
    ),
    statusIdx: index('idx_profile_action_approvals_status').on(table.status),
    requesterIdx: index('idx_profile_action_approvals_requester').on(
      table.requestedBy
    ),
  })
);

/**
 * Append-only audit trail for approval lifecycle events.
 */
export const profileApprovalEvents = pgTable(
  'profile_approval_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    approvalId: uuid('approval_id')
      .notNull()
      .references(() => profileActionApprovals.id, { onDelete: 'cascade' }),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    event: profileApprovalEventEnum('event').notNull(),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    approvalIdx: index('idx_profile_approval_events_approval').on(
      table.approvalId
    ),
    profileIdx: index('idx_profile_approval_events_profile').on(
      table.creatorProfileId
    ),
  })
);

export const insertProfileActionApprovalSchema = createInsertSchema(
  profileActionApprovals
);
export const selectProfileActionApprovalSchema = createSelectSchema(
  profileActionApprovals
);
export const insertProfileApprovalEventSchema = createInsertSchema(
  profileApprovalEvents
);
export const selectProfileApprovalEventSchema = createSelectSchema(
  profileApprovalEvents
);

export type ProfileActionApproval = typeof profileActionApprovals.$inferSelect;
export type NewProfileActionApproval =
  typeof profileActionApprovals.$inferInsert;
export type ProfileApprovalEvent = typeof profileApprovalEvents.$inferSelect;
export type NewProfileApprovalEvent = typeof profileApprovalEvents.$inferInsert;
