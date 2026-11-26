import type { AutoConnectedArtistSelection } from '@/features/dashboard/organisms/onboarding-v2/shared/useOnboardingSubmit';
import type {
  OnboardingBlockingReason as DiscoveryBlockingReason,
  SpotifyImportStatus as DiscoveryImportStatus,
  OnboardingReadinessPhase as DiscoveryReadinessPhase,
} from '@/lib/onboarding/discovery-readiness';

export const DISCOVERY_POLL_INTERVAL_MS = 1200;
export const DISCOVERY_FETCH_TIMEOUT_MS = 10_000;
export const DISCOVERY_TIMEOUT_MESSAGE =
  'Loading your releases is taking longer than expected. We will keep trying, or tap Refresh.';
export const DISCOVERY_AUTO_ADVANCE_MS = 800;

export type StepId =
  | 'handle'
  | 'spotify'
  | 'artist-confirm'
  | 'upgrade'
  | 'dsp'
  | 'social'
  | 'releases'
  | 'late-arrivals'
  | 'profile-ready';

export const STEP_ORDER: StepId[] = [
  'handle',
  'spotify',
  'artist-confirm',
  'upgrade',
  'dsp',
  'social',
  'releases',
  'late-arrivals',
  'profile-ready',
];

export interface SelectedArtist {
  id: string;
  imageUrl?: string | null;
  name: string;
  url: string;
}

export interface DiscoveryDspItem {
  confidenceScore: number | null;
  externalArtistId: string | null;
  externalArtistImageUrl: string | null;
  externalArtistName: string | null;
  externalArtistUrl: string | null;
  id: string;
  providerId: string;
  providerLabel: string;
  status: 'suggested' | 'confirmed' | 'rejected' | 'auto_confirmed';
}

export interface DiscoverySocialItem {
  confidence: number;
  id: string;
  kind: 'link' | 'suggestion';
  platform: string;
  platformLabel: string;
  source: string | null;
  state: string;
  url: string;
  username: string | null;
  version: number | null;
}

export interface DiscoveryRelease {
  artworkUrl: string | null;
  id: string;
  releaseDate: string | null;
  spotifyPopularity: number | null;
  title: string;
}

export interface DiscoverySnapshot {
  counts: {
    activeSocialCount: number;
    dspCount: number;
    releaseCount: number;
  };
  dspItems: DiscoveryDspItem[];
  hasPendingDiscoveryJob: boolean;
  importState?: {
    activeSocialCount: number;
    confirmedDspCount: number;
    hasImportedReleases: boolean;
    hasSpotifySelection: boolean;
    recordingCount: number;
    releaseCount: number;
    spotifyImportStatus: DiscoveryImportStatus;
  };
  profile: {
    activeSinceYear: number | null;
    appleMusicConnected: boolean;
    avatarUrl: string | null;
    bio: string | null;
    displayName: string | null;
    genres: string[] | null;
    hometown: string | null;
    id: string;
    location: string | null;
    onboardingCompletedAt: string | null;
    username: string;
  };
  releases: DiscoveryRelease[];
  readiness?: {
    blockingReason: DiscoveryBlockingReason;
    canProceedToDashboard: boolean;
    phase: DiscoveryReadinessPhase;
  };
  selectedSpotifyProfile: SelectedArtist | null;
  socialItems: DiscoverySocialItem[];
}

export interface DiscoveryResponse {
  snapshot: DiscoverySnapshot;
  success: boolean;
}

export interface LateArrival {
  id: string;
  subtitle: string;
  title: string;
}

export interface OnboardingV2FormProps {
  readonly assumeInitialHandleAvailable?: boolean;
  readonly existingAvatarUrl?: string | null;
  readonly existingBio?: string | null;
  readonly existingGenres?: string[] | null;
  readonly initialDisplayName?: string;
  readonly initialHandle?: string;
  readonly initialProfileId?: string | null;
  readonly initialResumeStep?: string | null;
  readonly isHydrated: boolean;
  readonly isReservedHandle?: boolean;
  readonly shouldAutoSubmitHandle?: boolean;
  readonly userEmail?: string | null;
  readonly userId: string;
  readonly designV1?: boolean;
}

export function getSidebarStepState(step: StepId, currentStep: StepId) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);
  const stepIndex = STEP_ORDER.indexOf(step);

  if (step === currentStep) {
    return 'current';
  }

  if (stepIndex < currentIndex) {
    return 'complete';
  }

  return 'pending';
}

export function normalizeSidebarCurrentStep(currentStep: StepId): StepId {
  if (currentStep === 'artist-confirm') {
    return 'spotify';
  }

  if (currentStep === 'late-arrivals') {
    return 'releases';
  }

  return currentStep;
}

export function normalizeSelectedArtist(
  artist: AutoConnectedArtistSelection | SelectedArtist | null
): SelectedArtist | null {
  if (!artist) return null;

  return {
    id: artist.id,
    imageUrl: null,
    name: artist.name,
    url: artist.url,
  };
}

export function normalizeResumeStep(
  step: string | null | undefined
): StepId | null {
  switch (step) {
    case 'handle':
      return 'handle';
    case 'spotify':
      return 'spotify';
    case 'artist-confirm':
      return 'artist-confirm';
    case 'upgrade':
      return 'upgrade';
    case 'dsp':
      return 'dsp';
    case 'social':
      return 'social';
    case 'releases':
      return 'releases';
    case 'late-arrivals':
      return 'late-arrivals';
    case 'profile-ready':
      return 'profile-ready';
    default:
      return null;
  }
}

export function getResumeQueryValue(step: StepId): string | null {
  switch (step) {
    case 'spotify':
    case 'artist-confirm':
    case 'upgrade':
      return 'spotify';
    case 'dsp':
    case 'social':
    case 'releases':
    case 'late-arrivals':
      return 'releases';
    case 'profile-ready':
      return step;
    default:
      return null;
  }
}

export function getDiscoveryReadiness(snapshot: DiscoverySnapshot | null) {
  return snapshot?.readiness ?? null;
}

export function canProceedToDashboard(
  snapshot: DiscoverySnapshot | null
): boolean {
  return Boolean(getDiscoveryReadiness(snapshot)?.canProceedToDashboard);
}

export function getBlockingReason(
  snapshot: DiscoverySnapshot | null
): DiscoveryBlockingReason {
  return getDiscoveryReadiness(snapshot)?.blockingReason ?? null;
}

export function isReadinessPending(
  snapshot: DiscoverySnapshot | null
): boolean {
  return !canProceedToDashboard(snapshot);
}

export function getReadinessMessage(
  snapshot: DiscoverySnapshot | null
): string | null {
  switch (getBlockingReason(snapshot)) {
    case 'missing_spotify_selection':
      return 'Choose your Spotify artist to start importing.';
    case 'spotify_import_in_progress':
      return 'We are still importing your Spotify releases.';
    case 'spotify_import_failed':
      return 'Spotify import failed. Choose your artist again to retry.';
    case 'discovery_in_progress':
      return 'We are finishing cross-platform discovery now.';
    case 'awaiting_first_release':
      return 'Your first releases have not landed yet. This is taking longer than usual.';
    default:
      return null;
  }
}

export function extractSpotifyArtistId(input: string): string | null {
  const trimmed = input.trim();
  const artistMatch = /(?:open\.)?spotify\.com\/artist\/([a-zA-Z0-9]{22})/.exec(
    trimmed
  );
  return artistMatch?.[1] ?? null;
}

export function addLateArrivalSuffix(
  currentStep: StepId,
  stage: 'dsp' | 'social' | 'releases'
): boolean {
  return STEP_ORDER.indexOf(currentStep) > STEP_ORDER.indexOf(stage);
}

export function mergeSelectedArtist(
  current: SelectedArtist | null,
  selectedSpotifyProfile: SelectedArtist | null
): SelectedArtist | null {
  if (!selectedSpotifyProfile) {
    return current;
  }

  if (!current) {
    return selectedSpotifyProfile;
  }

  if (current.id !== selectedSpotifyProfile.id) {
    return current;
  }

  return {
    ...current,
    imageUrl: current.imageUrl ?? selectedSpotifyProfile.imageUrl,
    name: current.name || selectedSpotifyProfile.name,
  };
}

export function appendLateArrivals<T>({
  buildItem,
  currentStep,
  getId,
  late,
  nextItems,
  previousItems,
  stage,
}: {
  buildItem: (item: T, id: string) => LateArrival;
  currentStep: StepId;
  getId: (item: T) => string;
  late: LateArrival[];
  nextItems: T[];
  previousItems: T[];
  stage: 'dsp' | 'social' | 'releases';
}) {
  if (!addLateArrivalSuffix(currentStep, stage)) {
    return;
  }

  const previousIds = new Set(previousItems.map(getId));
  for (const item of nextItems) {
    const id = getId(item);
    if (previousIds.has(id)) {
      continue;
    }

    late.push(buildItem(item, id));
  }
}

export function collectLateArrivals(
  previousSnapshot: DiscoverySnapshot,
  nextSnapshot: DiscoverySnapshot,
  currentStep: StepId
): LateArrival[] {
  const late: LateArrival[] = [];

  appendLateArrivals({
    buildItem: item => ({
      id: `dsp:${item.id}`,
      subtitle: item.providerLabel,
      title: item.externalArtistName || 'New DSP match',
    }),
    currentStep,
    getId: item => item.id,
    late,
    nextItems: nextSnapshot.dspItems,
    previousItems: previousSnapshot.dspItems,
    stage: 'dsp',
  });

  appendLateArrivals({
    buildItem: (item, id) => ({
      id: `social:${id}`,
      subtitle: item.platformLabel,
      title: item.username || item.url,
    }),
    currentStep,
    getId: item => `${item.kind}:${item.id}`,
    late,
    nextItems: nextSnapshot.socialItems,
    previousItems: previousSnapshot.socialItems,
    stage: 'social',
  });

  appendLateArrivals({
    buildItem: item => ({
      id: `release:${item.id}`,
      subtitle: 'Release discovered',
      title: item.title,
    }),
    currentStep,
    getId: item => item.id,
    late,
    nextItems: nextSnapshot.releases,
    previousItems: previousSnapshot.releases,
    stage: 'releases',
  });

  return late;
}

export function mergeLateArrivals(
  current: LateArrival[],
  nextItems: LateArrival[],
  seenIds: Set<string>
): LateArrival[] {
  const next = [...current];

  for (const item of nextItems) {
    if (seenIds.has(item.id)) {
      continue;
    }

    seenIds.add(item.id);
    next.push(item);
  }

  return next;
}

export function getDiscoveryErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Failed to load onboarding discovery.';
}

export function getDspStatusLabel(status: DiscoveryDspItem['status']): string {
  if (status === 'suggested') {
    return 'Needs your review';
  }

  if (status === 'auto_confirmed') {
    return 'Accepted automatically';
  }

  return 'Confirmed';
}

export async function fetchDiscoverySnapshot(
  profileId: string,
  signal?: AbortSignal
): Promise<DiscoverySnapshot> {
  // A hung request must turn into a visible, retryable error, not an endless
  // disabled Continue. The timeout is a separate controller so a caller abort
  // (unmount, newer poll) stays silent while a timeout surfaces.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DISCOVERY_FETCH_TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(
      `/api/onboarding/discovery?profileId=${encodeURIComponent(profileId)}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? 'Failed to load onboarding discovery.');
    }

    const payload = (await response.json()) as DiscoveryResponse;
    if (!payload.success) {
      throw new Error('Failed to load onboarding discovery.');
    }

    return payload.snapshot;
  } catch (error) {
    if (timedOut && !signal?.aborted) {
      throw new Error(DISCOVERY_TIMEOUT_MESSAGE);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}
