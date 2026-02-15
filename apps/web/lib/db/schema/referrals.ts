import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { users } from './auth';
import { referralCommissionStatusEnum, referralStatusEnum } from './enums';

/**
 * Referral codes table
 * Each user gets a unique referral code they can share.
 * Codes are short, URL-friendly strings (e.g., "jovie-sarah" or "MUSIC2024").
 */
export const referralCodes = pgTable('referral_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Referrals table
 * Tracks the relationship between referrer and referred user.
 * Commission rate and duration are captured at referral time (snapshot)
 * so program terms can change without affecting existing referrals.
 */
export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referrerUserId: uuid('referrer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    referredUserId: uuid('referred_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    referralCodeId: uuid('referral_code_id')
      .notNull()
      .references(() => referralCodes.id, { onDelete: 'cascade' }),
    status: referralStatusEnum('status').notNull().default('pending'),
    // Commission terms (snapshotted at referral creation)
    commissionRateBps: integer('commission_rate_bps').notNull().default(5000), // 5000 = 50%
    commissionDurationMonths: integer('commission_duration_months')
      .notNull()
      .default(24),
    // Lifecycle timestamps
    subscribedAt: timestamp('subscribed_at'), // When referred user first subscribed
    expiresAt: timestamp('expires_at'), // When commission period ends
    churnedAt: timestamp('churned_at'), // When referred user cancelled
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    referrerUserIdIdx: index('referrals_referrer_user_id_idx').on(
      table.referrerUserId
    ),
    referredUserIdIdx: index('referrals_referred_user_id_idx').on(
      table.referredUserId
    ),
    statusIdx: index('referrals_status_idx').on(table.status),
  })
);

/**
 * Referral commissions table
 * Tracks individual commission events tied to Stripe invoice payments.
 * One record per successful payment from a referred user.
 */
export const referralCommissions = pgTable(
  'referral_commissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referralId: uuid('referral_id')
      .notNull()
      .references(() => referrals.id, { onDelete: 'cascade' }),
    referrerUserId: uuid('referrer_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stripeInvoiceId: text('stripe_invoice_id').notNull().unique(),
    amountCents: integer('amount_cents').notNull(), // Commission amount in cents
    currency: text('currency').notNull().default('usd'),
    status: referralCommissionStatusEnum('status').notNull().default('pending'),
    periodStart: timestamp('period_start'),
    periodEnd: timestamp('period_end'),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    referralIdIdx: index('referral_commissions_referral_id_idx').on(
      table.referralId
    ),
    referrerUserIdIdx: index('referral_commissions_referrer_user_id_idx').on(
      table.referrerUserId
    ),
    statusIdx: index('referral_commissions_status_idx').on(table.status),
  })
);

// Schema validations
export const insertReferralCodeSchema = createInsertSchema(referralCodes);
export const selectReferralCodeSchema = createSelectSchema(referralCodes);

export const insertReferralSchema = createInsertSchema(referrals);
export const selectReferralSchema = createSelectSchema(referrals);

export const insertReferralCommissionSchema =
  createInsertSchema(referralCommissions);
export const selectReferralCommissionSchema =
  createSelectSchema(referralCommissions);

// Types
export type ReferralCode = typeof referralCodes.$inferSelect;
export type NewReferralCode = typeof referralCodes.$inferInsert;

export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;

export type ReferralCommission = typeof referralCommissions.$inferSelect;
export type NewReferralCommission = typeof referralCommissions.$inferInsert;
