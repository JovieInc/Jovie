// Storybook has no Next.js server-action transport. Keep the real picker and
// query hooks, with deterministic empty catalog responses at that boundary.
export async function loadReleaseMatrix() {
  return [];
}
export async function loadTourDates() {
  return [];
}
export async function loadReleaseEntity() {
  return null;
}
export const loadReleaseMatrixForProfile = loadReleaseMatrix;
export const loadArchivedReleaseMatrixForProfile = loadReleaseMatrix;
export const loadUpcomingTourDates = loadTourDates;
export async function checkBandsintownConnection() {
  return { connected: false };
}
async function unavailableMutation() {
  throw new Error('Catalog mutations are unavailable in Storybook');
}
export const saveBandsintownApiKey = unavailableMutation;
export const removeBandsintownApiKey = unavailableMutation;
export const connectBandsintownArtist = unavailableMutation;
export const syncFromBandsintown = unavailableMutation;
export const createTourDate = unavailableMutation;
export const updateTourDate = unavailableMutation;
export const deleteTourDate = unavailableMutation;
export const disconnectBandsintown = unavailableMutation;
