import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { playlistStatusEnum } from './enums';
import { creatorProfiles } from './profiles';

/**
 * Jovie-curated playlists.
 *
 * State machine: draft → pending → approved → published → archived
 *
 *   ┌───────┐    ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
 *   │ draft │───▶│ pending │───▶│ approved │───▶│ published │───▶│ archived │
 *   └───────┘    └────┬────┘    └──────────┘    └───────────┘    └──────────┘
 *                     │                                                │
 *                     └──────────▶ rejected ◀──────────────────────────┘
 *
 * - draft: LLM generated, not yet in approval queue
 * - pending: in admin approval queue
 * - approved: Tim approved, ready to publish to Spotify
 * - published: live on Spotify + Jovie
 * - archived: removed from public pages but Spotify playlist remains
 * - rejected: Tim rejected, will not be published
 */
export const joviePlaylists = pgTable(
  'jovie_playlists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spotifyPlaylistId: text('spotify_playlist_id').unique(),
    youtubePlaylistId: text('youtube_playlist_id'),
    curatorSpotifyUserId: text('curator_spotify_user_id'),
    curatorProfileId: uuid('curator_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'set null' }
    ),
    title: text('title').notNull(),
    description: text('description'),
    slug: text('slug').notNull().unique(),
    theme: text('theme'),
    genreTags: text('genre_tags').array().default([]),
    moodTags: text('mood_tags').array().default([]),
    trackCount: integer('track_count').default(0).notNull(),
    coverImageUrl: text('cover_image_url'),
    coverImageFullUrl: text('cover_image_full_url'),
    editorialNote: text('editorial_note'),
    llmPrompt: text('llm_prompt'),
    llmModel: text('llm_model'),
    status: playlistStatusEnum('status').notNull().default('draft'),
    statusChangedAt: timestamp('status_changed_at').defaultNow().notNull(),
    rejectionNote: text('rejection_note'),
    publishedAt: timestamp('published_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('jovie_playlists_slug_idx').on(table.slug),
    index('jovie_playlists_status_idx').on(table.status),
    index('jovie_playlists_published_at_idx').on(table.publishedAt),
    index('jovie_playlists_genre_tags_idx').using(
      'gin',
      drizzleSql`${table.genreTags}`
    ),
    index('jovie_playlists_mood_tags_idx').using(
      'gin',
      drizzleSql`${table.moodTags}`
    ),
  ]
);

export const joviePlaylistTracks = pgTable(
  'jovie_playlist_tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playlistId: uuid('playlist_id')
      .notNull()
      .references(() => joviePlaylists.id, { onDelete: 'cascade' }),
    spotifyTrackId: text('spotify_track_id'),
    youtubeVideoId: text('youtube_video_id'),
    position: integer('position').notNull(),
    artistName: text('artist_name').notNull(),
    trackName: text('track_name').notNull(),
    spotifyArtistId: text('spotify_artist_id'),
    jovieProfileId: uuid('jovie_profile_id').references(
      () => creatorProfiles.id,
      { onDelete: 'set null' }
    ),
    isJovieArtist: boolean('is_jovie_artist').default(false).notNull(),
    addedAt: timestamp('added_at').defaultNow().notNull(),
  },
  table => [
    index('jovie_playlist_tracks_playlist_idx').on(table.playlistId),
    index('jovie_playlist_tracks_spotify_artist_idx').on(table.spotifyArtistId),
  ]
);

// Zod schemas
export const insertJoviePlaylistSchema = createInsertSchema(joviePlaylists);
export const selectJoviePlaylistSchema = createSelectSchema(joviePlaylists);
export const insertJoviePlaylistTrackSchema =
  createInsertSchema(joviePlaylistTracks);
export const selectJoviePlaylistTrackSchema =
  createSelectSchema(joviePlaylistTracks);

// Types
export type JoviePlaylist = typeof joviePlaylists.$inferSelect;
export type NewJoviePlaylist = typeof joviePlaylists.$inferInsert;
export type JoviePlaylistTrack = typeof joviePlaylistTracks.$inferSelect;
export type NewJoviePlaylistTrack = typeof joviePlaylistTracks.$inferInsert;
