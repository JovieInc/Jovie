import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Better Auth core tables (better-auth@1.6.23).
 *
 * These four tables are owned by Better Auth via its Drizzle adapter
 * (`modelName` mapping: user→ba_users, session→ba_sessions,
 * account→ba_accounts, verification→ba_verifications). They are intentionally
 * separate from the app `users` table; the link column is
 * `users.better_auth_user_id` (nullable, unique).
 *
 * Field keys are camelCase to match Better Auth's default `fieldName`s — the
 * Drizzle adapter resolves columns by TS property name — while SQL column
 * names stay snake_case per repo convention. Shapes mirror the core schema in
 * `@better-auth/core/db` `getAuthTables` at the pinned version; verify against
 * the installed package before changing.
 */

export const baUsers = pgTable('ba_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const baSessions = pgTable(
  'ba_sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => baUsers.id, { onDelete: 'cascade' }),
  },
  table => ({
    tokenIdx: uniqueIndex('idx_ba_sessions_token').on(table.token),
    userIdIdx: index('idx_ba_sessions_user_id').on(table.userId),
  })
);

export const baAccounts = pgTable(
  'ba_accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => baUsers.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => ({
    userIdIdx: index('idx_ba_accounts_user_id').on(table.userId),
  })
);

export const baVerifications = pgTable(
  'ba_verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => ({
    identifierIdx: index('idx_ba_verifications_identifier').on(
      table.identifier
    ),
  })
);

// Types
export type BaUser = typeof baUsers.$inferSelect;
export type NewBaUser = typeof baUsers.$inferInsert;

export type BaSession = typeof baSessions.$inferSelect;
export type NewBaSession = typeof baSessions.$inferInsert;

export type BaAccount = typeof baAccounts.$inferSelect;
export type NewBaAccount = typeof baAccounts.$inferInsert;

export type BaVerification = typeof baVerifications.$inferSelect;
export type NewBaVerification = typeof baVerifications.$inferInsert;
