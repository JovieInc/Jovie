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
  processProviderRecordingArtistCredits,
  processRecordingArtistCredits,
  processReleaseArtistCredits,
  processTrackArtistCredits,
} from './artist-import';
// Search operations
export {
  getCreditedArtistsWithProfiles,
  getFrequentCollaborators,
  getStructuredReleaseCollaborators,
  searchArtists,
} from './artist-search';
// Recording-artist operations
export {
  deleteRecordingArtistRole,
  deleteRecordingArtists,
  getArtistsForRecording,
  getRecordingArtistCreditEdges,
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
  CreditedArtistWithProfile,
  FindOrCreateArtistInput,
  StructuredReleaseCollaborator,
} from './types';
