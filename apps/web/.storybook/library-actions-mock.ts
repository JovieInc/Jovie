// Stands in for both the release and library server-action modules in
// Storybook. It must export every action either module exports: a missing
// export fails the whole story module, not just the story that needs it.
const mutationResult = async (..._args: unknown[]) => ({ success: true });

export const archiveLibraryMerchCard = mutationResult;
export const archiveLibraryRelease = mutationResult;
export const checkAppleMusicConnection = mutationResult;
export const checkAppleMusicConnectionForProfile = mutationResult;
export const checkSpotifyConnection = mutationResult;
export const checkSpotifyConnectionForProfile = mutationResult;
export const connectAppleMusicArtist = mutationResult;
export const connectSpotifyArtist = mutationResult;
export const createRelease = mutationResult;
export const deleteRelease = mutationResult;
export const formatReleaseLyrics = mutationResult;
export const getSpotifyImportPollSnapshot = mutationResult;
export const loadReleaseEntity = mutationResult;
export const loadReleaseMatrix = mutationResult;
export const loadReleaseMatrixForProfile = mutationResult;
export const loadTracksForRelease = mutationResult;
export const refreshRelease = mutationResult;
export const rescanAppleMusicLinks = mutationResult;
export const rescanIsrcLinks = mutationResult;
export const resetProviderOverride = mutationResult;
export const restoreLibraryMerchCard = mutationResult;
export const restoreRelease = mutationResult;
export const revertReleaseArtwork = mutationResult;
export const saveCanvasStatus = mutationResult;
export const savePrimaryIsrc = mutationResult;
export const saveProviderOverride = mutationResult;
export const saveReleaseLyrics = mutationResult;
export const saveReleaseMetadata = mutationResult;
export const saveReleaseStatus = mutationResult;
export const syncFromSpotify = mutationResult;
export const updateAllowArtworkDownloads = mutationResult;
export const uploadReleaseArtwork = mutationResult;
