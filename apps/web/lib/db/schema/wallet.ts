import { sql as drizzleSql } from 'drizzle-orm';
import {
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
import { audienceSourceLinks } from './analytics';
import { creatorProfiles } from './profiles';

export const appleWalletProfilePasses = pgTable(
  'apple_wallet_profile_passes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    creatorProfileId: uuid('creator_profile_id')
      .notNull()
      .references(() => creatorProfiles.id, { onDelete: 'cascade' }),
    sourceLinkId: uuid('source_link_id').references(
      () => audienceSourceLinks.id,
      { onDelete: 'set null' }
    ),
    passTypeIdentifier: text('pass_type_identifier').notNull(),
    serialNumber: text('serial_number').notNull(),
    authenticationTokenHash: text('authentication_token_hash').notNull(),
    profileUrl: text('profile_url').notNull(),
    walletShareUrl: text('wallet_share_url').notNull(),
    displayName: text('display_name').notNull(),
    handle: text('handle').notNull(),
    avatarUrl: text('avatar_url'),
    avatarAssetVersion: text('avatar_asset_version').notNull(),
    passVersion: integer('pass_version').default(1).notNull(),
    lastUpdatedTag: text('last_updated_tag').notNull(),
    downloadCount: integer('download_count').default(0).notNull(),
    lastDownloadedAt: timestamp('last_downloaded_at'),
    lastPushedAt: timestamp('last_pushed_at'),
    lastPushError: text('last_push_error'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    profilePassTypeUnique: uniqueIndex(
      'apple_wallet_profile_passes_profile_pass_type_unique'
    ).on(table.creatorProfileId, table.passTypeIdentifier),
    serialUnique: uniqueIndex(
      'apple_wallet_profile_passes_pass_type_serial_unique'
    ).on(table.passTypeIdentifier, table.serialNumber),
    sourceLinkIdx: index('apple_wallet_profile_passes_source_link_id_idx').on(
      table.sourceLinkId
    ),
    activeUpdatedIdx: index('apple_wallet_profile_passes_active_updated_idx')
      .on(table.passTypeIdentifier, table.updatedAt)
      .where(drizzleSql`revoked_at IS NULL`),
  })
);

export const appleWalletPassDevices = pgTable(
  'apple_wallet_pass_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceLibraryIdentifier: text('device_library_identifier').notNull(),
    pushToken: text('push_token').notNull(),
    disabledAt: timestamp('disabled_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    deviceLibraryIdentifierUnique: uniqueIndex(
      'apple_wallet_pass_devices_library_identifier_unique'
    ).on(table.deviceLibraryIdentifier),
    activeDeviceIdx: index('apple_wallet_pass_devices_active_idx')
      .on(table.updatedAt)
      .where(drizzleSql`disabled_at IS NULL`),
  })
);

export const appleWalletPassRegistrations = pgTable(
  'apple_wallet_pass_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passId: uuid('pass_id')
      .notNull()
      .references(() => appleWalletProfilePasses.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => appleWalletPassDevices.id, { onDelete: 'cascade' }),
    registeredAt: timestamp('registered_at').defaultNow().notNull(),
    unregisteredAt: timestamp('unregistered_at'),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    passDeviceUnique: uniqueIndex(
      'apple_wallet_pass_registrations_pass_device_unique'
    ).on(table.passId, table.deviceId),
    deviceActiveIdx: index('apple_wallet_pass_registrations_device_active_idx')
      .on(table.deviceId, table.updatedAt)
      .where(drizzleSql`unregistered_at IS NULL`),
    passActiveIdx: index('apple_wallet_pass_registrations_pass_active_idx')
      .on(table.passId, table.updatedAt)
      .where(drizzleSql`unregistered_at IS NULL`),
  })
);

export const insertAppleWalletProfilePassSchema = createInsertSchema(
  appleWalletProfilePasses
);
export const selectAppleWalletProfilePassSchema = createSelectSchema(
  appleWalletProfilePasses
);
export const insertAppleWalletPassDeviceSchema = createInsertSchema(
  appleWalletPassDevices
);
export const selectAppleWalletPassDeviceSchema = createSelectSchema(
  appleWalletPassDevices
);
export const insertAppleWalletPassRegistrationSchema = createInsertSchema(
  appleWalletPassRegistrations
);
export const selectAppleWalletPassRegistrationSchema = createSelectSchema(
  appleWalletPassRegistrations
);

export type AppleWalletProfilePass =
  typeof appleWalletProfilePasses.$inferSelect;
export type NewAppleWalletProfilePass =
  typeof appleWalletProfilePasses.$inferInsert;
export type AppleWalletPassDevice = typeof appleWalletPassDevices.$inferSelect;
export type NewAppleWalletPassDevice =
  typeof appleWalletPassDevices.$inferInsert;
export type AppleWalletPassRegistration =
  typeof appleWalletPassRegistrations.$inferSelect;
export type NewAppleWalletPassRegistration =
  typeof appleWalletPassRegistrations.$inferInsert;
