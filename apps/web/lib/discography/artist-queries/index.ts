/**
 * Artist Query Functions
 *
 * Database operations for the multi-artist support system.
 * Handles artist lookups, track/release artist relationships,
 * and collaboration queries.
 */

// CRUD operations
export {
  findArtist,
  findOrCreateArtist,
  getArtistByCreatorProfile,
  getArtistById,
} from './artist-crud';
// Import operations
export {
  processRecordingArtistCredits,
  processReleaseArtistCredits,
  processTrackArtistCredits,
} from './artist-import';
// Search operations
export { getFrequentCollaborators, searchArtists } from './artist-search';
// Recording-artist operations
export {
  deleteRecordingArtists,
  getArtistsForRecording,
  getRecordingsByArtist,
  upsertRecordingArtist,
} from './recording-artists';
// Release-artist operations
export {
  deleteReleaseArtists,
  getArtistsForRelease,
  getReleasesByArtist,
  upsertReleaseArtist,
} from './release-artists';
// Track-artist operations (legacy)
export {
  deleteTrackArtists,
  getArtistsForTrack,
  getTracksByArtist,
  upsertTrackArtist,
} from './track-artists';
// Types
export type {
  ArtistWithRole,
  CollaboratorInfo,
  FindOrCreateArtistInput,
} from './types';
