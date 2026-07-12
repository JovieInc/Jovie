// Mock for @/app/onboarding/actions in Storybook
// These server actions cannot run in the browser, so we provide stubs

export async function completeOnboarding(
  _formData: FormData
): Promise<{ success: boolean; error?: string }> {
  // Simulate a successful onboarding completion
  console.log('[Storybook Mock] completeOnboarding called');
  return { success: true };
}

export async function checkHandleAvailability(
  _handle: string
): Promise<{ available: boolean; error?: string }> {
  console.log('[Storybook Mock] checkHandleAvailability called');
  return { available: true };
}

export async function validateDisplayName(
  _name: string
): Promise<{ valid: boolean; error?: string }> {
  console.log('[Storybook Mock] validateDisplayName called');
  return { valid: true };
}

export interface ConnectOnboardingSpotifyArtistParams {
  artistName: string;
  includeTracks?: boolean;
  profileId: string;
  skipMusicFetchEnrichment?: boolean;
  spotifyArtistId: string;
  spotifyArtistUrl: string;
}

export interface ConnectOnboardingSpotifyArtistResult {
  artistName: string;
  imported: number;
  importing: boolean;
  message: string;
  success: boolean;
}

export async function connectOnboardingSpotifyArtist(
  params: ConnectOnboardingSpotifyArtistParams
): Promise<ConnectOnboardingSpotifyArtistResult> {
  console.log('[Storybook Mock] connectOnboardingSpotifyArtist called');
  return {
    artistName: params.artistName,
    imported: 0,
    importing: false,
    message: 'Storybook mock: Spotify connect skipped',
    success: true,
  };
}

export async function verifyProfileHasAvatar(): Promise<{
  avatarUrl: string;
}> {
  console.log('[Storybook Mock] verifyProfileHasAvatar called');
  return { avatarUrl: 'https://placehold.co/256x256' };
}

export async function getProfileAvatarUrl(): Promise<{
  avatarUrl: string | null;
}> {
  console.log('[Storybook Mock] getProfileAvatarUrl called');
  return { avatarUrl: null };
}

export async function updateOnboardingProfile(_updates: {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}): Promise<{ success: boolean }> {
  console.log('[Storybook Mock] updateOnboardingProfile called');
  return { success: true };
}
