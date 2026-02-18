'use server';

export {
  revertReleaseArtwork,
  updateAllowArtworkDownloads,
  uploadReleaseArtwork,
} from './releases-artwork';
// Re-export all release actions from domain-specific modules
export {
  loadReleaseMatrix,
  refreshRelease,
  resetProviderOverride,
  saveProviderOverride,
} from './releases-crud';
export {
  checkAppleMusicConnection,
  checkSpotifyConnection,
  connectAppleMusicArtist,
  connectSpotifyArtist,
  rescanIsrcLinks,
  syncFromSpotify,
} from './releases-spotify';
export { loadTracksForRelease } from './releases-tracks';
