import {
  boolean,
  index,
  jsonb,
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
  phoneNumber: text('phone_number').unique(),
  phoneNumberVerified: boolean('phone_number_verified')
    .notNull()
    .default(false),
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

/** Asymmetric signing keys used by Better Auth's JWT/OIDC issuer. */
export const baJwks = pgTable('ba_jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
});

export const baOauthClients = pgTable(
  'ba_oauth_clients',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id').notNull().unique(),
    clientSecret: text('client_secret'),
    disabled: boolean('disabled').notNull().default(false),
    skipConsent: boolean('skip_consent'),
    enableEndSession: boolean('enable_end_session'),
    subjectType: text('subject_type'),
    scopes: jsonb('scopes').$type<string[]>(),
    userId: text('user_id').references(() => baUsers.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    name: text('name'),
    uri: text('uri'),
    icon: text('icon'),
    contacts: jsonb('contacts').$type<string[]>(),
    tos: text('tos'),
    policy: text('policy'),
    softwareId: text('software_id'),
    softwareVersion: text('software_version'),
    softwareStatement: text('software_statement'),
    redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
    postLogoutRedirectUris: jsonb('post_logout_redirect_uris').$type<
      string[]
    >(),
    tokenEndpointAuthMethod: text('token_endpoint_auth_method'),
    grantTypes: jsonb('grant_types').$type<string[]>(),
    responseTypes: jsonb('response_types').$type<string[]>(),
    public: boolean('public'),
    type: text('type'),
    requirePKCE: boolean('require_pkce'),
    referenceId: text('reference_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  table => ({
    userIdIdx: index('idx_ba_oauth_clients_user_id').on(table.userId),
  })
);

export const baOauthRefreshTokens = pgTable(
  'ba_oauth_refresh_tokens',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => baOauthClients.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => baSessions.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => baUsers.id, { onDelete: 'cascade' }),
    referenceId: text('reference_id'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    revoked: timestamp('revoked'),
    authTime: timestamp('auth_time'),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
  },
  table => ({
    clientIdIdx: index('idx_ba_oauth_refresh_tokens_client_id').on(
      table.clientId
    ),
    sessionIdIdx: index('idx_ba_oauth_refresh_tokens_session_id').on(
      table.sessionId
    ),
    userIdIdx: index('idx_ba_oauth_refresh_tokens_user_id').on(table.userId),
  })
);

export const baOauthAccessTokens = pgTable(
  'ba_oauth_access_tokens',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    clientId: text('client_id')
      .notNull()
      .references(() => baOauthClients.clientId, { onDelete: 'cascade' }),
    sessionId: text('session_id').references(() => baSessions.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id').references(() => baUsers.id, {
      onDelete: 'cascade',
    }),
    referenceId: text('reference_id'),
    refreshId: text('refresh_id').references(() => baOauthRefreshTokens.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
  },
  table => ({
    clientIdIdx: index('idx_ba_oauth_access_tokens_client_id').on(
      table.clientId
    ),
    sessionIdIdx: index('idx_ba_oauth_access_tokens_session_id').on(
      table.sessionId
    ),
    userIdIdx: index('idx_ba_oauth_access_tokens_user_id').on(table.userId),
    refreshIdIdx: index('idx_ba_oauth_access_tokens_refresh_id').on(
      table.refreshId
    ),
  })
);

export const baOauthConsents = pgTable(
  'ba_oauth_consents',
  {
    id: text('id').primaryKey(),
    clientId: text('client_id')
      .notNull()
      .references(() => baOauthClients.clientId, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => baUsers.id, {
      onDelete: 'cascade',
    }),
    referenceId: text('reference_id'),
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  table => ({
    clientIdIdx: index('idx_ba_oauth_consents_client_id').on(table.clientId),
    userIdIdx: index('idx_ba_oauth_consents_user_id').on(table.userId),
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
