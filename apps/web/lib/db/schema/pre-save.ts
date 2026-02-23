import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { discogReleases, discogTracks } from './content';

export const preSaveTokens = pgTable(
  'pre_save_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => discogReleases.id, { onDelete: 'cascade' }),
    trackId: uuid('track_id').references(() => discogTracks.id, {
      onDelete: 'cascade',
    }),
    provider: text('provider').notNull(),
    spotifyAccountId: text('spotify_account_id'),
    encryptedAccessToken: text('encrypted_access_token'),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    encryptedAppleMusicUserToken: text('encrypted_apple_music_user_token'),
    fanEmail: text('fan_email'),
    executedAt: timestamp('executed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    releaseIdx: index('pre_save_tokens_release_id_idx').on(table.releaseId),
    providerIdx: index('pre_save_tokens_provider_idx').on(table.provider),
    executedIdx: index('pre_save_tokens_executed_at_idx').on(table.executedAt),
    spotifyUnique: uniqueIndex('pre_save_tokens_spotify_unique_idx').on(
      table.releaseId,
      table.provider,
      table.spotifyAccountId
    ),
  })
);

export type PreSaveToken = typeof preSaveTokens.$inferSelect;
export type NewPreSaveToken = typeof preSaveTokens.$inferInsert;
