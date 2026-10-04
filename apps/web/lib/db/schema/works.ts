import {
  type ArtistRole,
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  recordingArtists,
  releaseArtists,
} from './content';

/**
 * Generic Identity ↔ Work schema facade (JOV-7631).
 *
 * Jovie is an identity product for every creator, not only musicians. The
 * physical tables keep their music-specific names until the JOV-7323
 * migration renames them; new code should reference the generic handles
 * below so the eventual rename is a one-line change here.
 *
 * Mapping (generic → physical):
 * - works              → discog_releases        — a published creative work
 *   (album, episode season, drop, collection)
 * - workItems          → discog_recordings      — the canonical item a work
 *   contains (track, episode, piece)
 * - workItemPlacements → discog_release_tracks  — an item's ordered placement
 *   on a work
 * - workCredits        → release_artists        — credits on the work
 * - workItemCredits    → recording_artists      — credits on the canonical item
 *
 * Credit rows point at the `artists` registry, which resolves to
 * `creator_profiles` once the collaborator is claimed — that is the generic
 * creator-credit join the proposal asks for.
 *
 * `discog_tracks` / `track_artists` are legacy write targets and stay
 * unmapped: do not build new reads on them.
 */
export const works = discogReleases;
export const workItems = discogRecordings;
export const workItemPlacements = discogReleaseTracks;
export const workCredits = releaseArtists;
export const workItemCredits = recordingArtists;

export type Work = typeof works.$inferSelect;
export type NewWork = typeof works.$inferInsert;

export type WorkItem = typeof workItems.$inferSelect;
export type NewWorkItem = typeof workItems.$inferInsert;

export type WorkItemPlacement = typeof workItemPlacements.$inferSelect;
export type NewWorkItemPlacement = typeof workItemPlacements.$inferInsert;

export type WorkCredit = typeof workCredits.$inferSelect;
export type NewWorkCredit = typeof workCredits.$inferInsert;

export type WorkItemCredit = typeof workItemCredits.$inferSelect;
export type NewWorkItemCredit = typeof workItemCredits.$inferInsert;

/**
 * Generic credit role. The stored enum keeps music credit values
 * (main_artist, producer, …) until JOV-7323; non-music works use 'other'
 * plus `credit_name`/`metadata` for the display role.
 */
export type WorkCreditRole = ArtistRole;
