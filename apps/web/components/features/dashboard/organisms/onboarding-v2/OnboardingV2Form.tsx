'use client';

import { Button } from '@jovie/ui';
import {
  ArrowRight,
  Check,
  Disc3,
  ExternalLink,
  Link2,
  Loader2,
  Music2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { AuthBackButton } from '@/features/auth';
import { PREVIEW_PANEL_WIDTH } from '@/features/dashboard/layout/PreviewPanel';
import { useHandleValidation } from '@/features/dashboard/organisms/apple-style-onboarding/useHandleValidation';
import {
  type AutoConnectedArtistSelection,
  extractSignupClaimArtistSelection,
  useOnboardingSubmit,
} from '@/features/dashboard/organisms/apple-style-onboarding/useOnboardingSubmit';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding';
import {
  ONBOARDING_PREVIEW_SNAPSHOT_KEY,
  ONBOARDING_WELCOME_REPLY_KEY,
} from '@/lib/onboarding/session-keys';
import type { AvatarQuality } from '@/lib/profile/avatar-quality';
import { type SpotifyArtistResult, useArtistSearchQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { connectOnboardingSpotifyArtist } from '../../../../../app/onboarding/actions/connect-spotify';
import { enrichProfileFromDsp } from '../../../../../app/onboarding/actions/enrich-profile';

const DISCOVERY_POLL_INTERVAL_MS = 1200;
const DISCOVERY_STAGE_TIMEOUT_MS = 10000;
const DISCOVERY_AUTO_ADVANCE_MS = 800;

type StepId =
  | 'handle'
  | 'spotify'
  | 'artist-confirm'
  | 'upgrade'
  | 'dsp'
  | 'social'
  | 'releases'
  | 'late-arrivals'
  | 'profile-ready';

interface SelectedArtist {
  id: string;
  imageUrl?: string | null;
  name: string;
  url: string;
}

interface DiscoveryDspItem {
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

interface DiscoverySocialItem {
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

interface DiscoveryRelease {
  artworkUrl: string | null;
  id: string;
  releaseDate: string | null;
  spotifyPopularity: number | null;
  title: string;
}

interface DiscoverySnapshot {
  counts: {
    activeSocialCount: number;
    dspCount: number;
    releaseCount: number;
  };
  dspItems: DiscoveryDspItem[];
  hasPendingDiscoveryJob: boolean;
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
  selectedSpotifyProfile: SelectedArtist | null;
  socialItems: DiscoverySocialItem[];
}

interface DiscoveryResponse {
  snapshot: DiscoverySnapshot;
  success: boolean;
}

interface LateArrival {
  id: string;
  subtitle: string;
  title: string;
}

interface OnboardingV2FormProps {
  readonly existingAvatarUrl?: string | null;
  readonly existingAvatarQuality?: AvatarQuality | null;
  readonly existingBio?: string | null;
  readonly existingGenres?: string[] | null;
  readonly initialDisplayName?: string;
  readonly initialHandle?: string;
  readonly initialProfileId?: string | null;
  readonly initialResumeStep?: string | null;
  readonly isReservedHandle?: boolean;
  readonly shouldAutoSubmitHandle?: boolean;
  readonly userEmail?: string | null;
  readonly userId: string;
}

interface StepFrameProps {
  readonly actions?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly prompt?: string;
  readonly title: string;
}

function normalizeSelectedArtist(
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

function normalizeResumeStep(step: string | null | undefined): StepId | null {
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

function getResumeQueryValue(step: StepId): string | null {
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

function hasBlockingDspItems(snapshot: DiscoverySnapshot | null): boolean {
  if (!snapshot) return false;
  return snapshot.dspItems.some(item => item.status === 'suggested');
}

function hasBlockingSocialItems(snapshot: DiscoverySnapshot | null): boolean {
  if (!snapshot) return false;

  return snapshot.socialItems.some(item => {
    if (item.kind === 'suggestion') return item.state === 'pending';
    return item.state === 'suggested';
  });
}

function extractSpotifyArtistId(input: string): string | null {
  const trimmed = input.trim();
  const artistMatch = /(?:open\.)?spotify\.com\/artist\/([a-zA-Z0-9]{22})/.exec(
    trimmed
  );
  return artistMatch?.[1] ?? null;
}

function addLateArrivalSuffix(
  currentStep: StepId,
  stage: 'dsp' | 'social' | 'releases'
): boolean {
  const order: StepId[] = [
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
  return order.indexOf(currentStep) > order.indexOf(stage);
}

function mergeSelectedArtist(
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

function appendLateArrivals<T>({
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

function collectLateArrivals(
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

function mergeLateArrivals(
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

function getDiscoveryErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Failed to load onboarding discovery.';
}

function getDspStatusLabel(status: DiscoveryDspItem['status']): string {
  if (status === 'suggested') {
    return 'Needs your review';
  }

  if (status === 'auto_confirmed') {
    return 'Accepted automatically';
  }

  return 'Confirmed';
}

async function fetchDiscoverySnapshot(
  profileId: string,
  signal?: AbortSignal
): Promise<DiscoverySnapshot> {
  const response = await fetch(
    `/api/onboarding/discovery?profileId=${encodeURIComponent(profileId)}`,
    {
      cache: 'no-store',
      signal,
    }
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
}

function StepFrame({ actions, children, prompt, title }: StepFrameProps) {
  return (
    <div className='mx-auto flex w-full max-w-2xl flex-col gap-6'>
      <div className='space-y-2'>
        <p className='text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
          Onboarding
        </p>
        <h1 className='text-3xl font-[620] tracking-[-0.04em] text-primary-token sm:text-[2.7rem]'>
          {title}
        </h1>
        {prompt ? (
          <p className='max-w-xl text-sm leading-6 text-secondary-token sm:text-[15px]'>
            {prompt}
          </p>
        ) : null}
      </div>

      <div className='space-y-4'>{children}</div>

      {actions ? (
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({
  body,
  title,
}: Readonly<{ body: string; title: string }>) {
  return (
    <ContentSurfaceCard className='border-dashed p-5'>
      <p className='text-sm font-[560] text-primary-token'>{title}</p>
      <p className='mt-1 text-sm leading-6 text-secondary-token'>{body}</p>
    </ContentSurfaceCard>
  );
}

function SelectedArtistCard({
  artist,
  isLoading,
}: Readonly<{ artist: SelectedArtist | null; isLoading: boolean }>) {
  return (
    <ContentSurfaceCard className='p-5'>
      <div className='flex items-center gap-4'>
        {artist?.imageUrl ? (
          <Image
            src={artist.imageUrl}
            alt=''
            width={72}
            height={72}
            className='h-[72px] w-[72px] rounded-full object-cover'
            unoptimized
          />
        ) : (
          <div className='flex h-[72px] w-[72px] items-center justify-center rounded-full bg-surface-0 text-tertiary-token'>
            <Music2 className='h-6 w-6' />
          </div>
        )}

        <div className='min-w-0 flex-1'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
            Selected artist
          </p>
          <p className='truncate text-lg font-[590] text-primary-token'>
            {artist?.name || 'Spotify artist'}
          </p>
          <div className='mt-2 flex items-center gap-2 text-sm text-secondary-token'>
            {isLoading ? (
              <>
                <Loader2 className='h-4 w-4 animate-spin' />
                <span>Importing and enriching in the background…</span>
              </>
            ) : (
              <>
                <Check className='h-4 w-4 text-success' />
                <span>Connected for this profile</span>
              </>
            )}
          </div>
        </div>

        {artist?.url ? (
          <Button asChild variant='secondary' size='sm'>
            <Link href={artist.url} target='_blank' rel='noreferrer'>
              View
              <ExternalLink className='ml-1 h-3.5 w-3.5' />
            </Link>
          </Button>
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}

function PreviewPanel({
  discoverySnapshot,
  existingAvatarUrl,
  existingBio,
  existingGenres,
  selectedArtist,
}: Readonly<{
  discoverySnapshot: DiscoverySnapshot | null;
  existingAvatarUrl: string | null;
  existingBio: string | null;
  existingGenres: string[] | null;
  selectedArtist: SelectedArtist | null;
}>) {
  const profile = discoverySnapshot?.profile;
  const activeLinks = (discoverySnapshot?.socialItems ?? []).filter(
    item => item.kind === 'link' && item.state === 'active'
  );

  return (
    <aside
      className='hidden xl:block'
      style={{ width: `${PREVIEW_PANEL_WIDTH}px` }}
    >
      <div className='sticky top-8 space-y-4'>
        <ContentSurfaceCard className='overflow-hidden p-5'>
          <div className='flex items-center gap-3'>
            {(profile?.avatarUrl ?? existingAvatarUrl) ? (
              <Image
                src={profile?.avatarUrl ?? existingAvatarUrl ?? ''}
                alt=''
                width={56}
                height={56}
                className='h-14 w-14 rounded-full object-cover'
                unoptimized
              />
            ) : (
              <div className='flex h-14 w-14 items-center justify-center rounded-full bg-surface-0 text-tertiary-token'>
                <Sparkles className='h-5 w-5' />
              </div>
            )}
            <div className='min-w-0'>
              <p className='truncate text-base font-[590] text-primary-token'>
                {profile?.displayName || selectedArtist?.name || 'Your profile'}
              </p>
              <p className='truncate text-sm text-secondary-token'>
                @{profile?.username ?? 'pending'}
              </p>
            </div>
          </div>

          <div className='mt-4 grid grid-cols-3 gap-2 text-center'>
            <div className='rounded-2xl bg-surface-0 px-3 py-2'>
              <p className='text-lg font-[590] text-primary-token'>
                {discoverySnapshot?.counts.releaseCount ?? 0}
              </p>
              <p className='text-[11px] uppercase tracking-[0.12em] text-tertiary-token'>
                Releases
              </p>
            </div>
            <div className='rounded-2xl bg-surface-0 px-3 py-2'>
              <p className='text-lg font-[590] text-primary-token'>
                {discoverySnapshot?.counts.dspCount ?? (selectedArtist ? 1 : 0)}
              </p>
              <p className='text-[11px] uppercase tracking-[0.12em] text-tertiary-token'>
                DSPs
              </p>
            </div>
            <div className='rounded-2xl bg-surface-0 px-3 py-2'>
              <p className='text-lg font-[590] text-primary-token'>
                {discoverySnapshot?.counts.activeSocialCount ?? 0}
              </p>
              <p className='text-[11px] uppercase tracking-[0.12em] text-tertiary-token'>
                Social
              </p>
            </div>
          </div>
        </ContentSurfaceCard>

        <ContentSurfaceCard className='p-5'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
            Profile preview
          </p>
          <div className='mt-3 space-y-3'>
            {profile?.bio || existingBio ? (
              <p className='text-sm leading-6 text-secondary-token'>
                {profile?.bio ?? existingBio}
              </p>
            ) : (
              <p className='text-sm leading-6 text-secondary-token'>
                Your profile summary will keep getting better as discovery
                finishes.
              </p>
            )}

            {(profile?.genres ?? existingGenres)?.length ? (
              <div className='flex flex-wrap gap-2'>
                {(profile?.genres ?? existingGenres ?? [])
                  .slice(0, 4)
                  .map(genre => (
                    <span
                      key={genre}
                      className='rounded-full bg-surface-0 px-2.5 py-1 text-[11px] text-secondary-token'
                    >
                      {genre}
                    </span>
                  ))}
              </div>
            ) : null}

            {activeLinks.length > 0 ? (
              <div className='space-y-2'>
                {activeLinks.slice(0, 4).map(link => (
                  <div
                    key={`${link.kind}:${link.id}`}
                    className='flex items-center justify-between rounded-2xl bg-surface-0 px-3 py-2'
                  >
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-[560] text-primary-token'>
                        {link.platformLabel}
                      </p>
                      <p className='truncate text-xs text-secondary-token'>
                        {link.username || link.url}
                      </p>
                    </div>
                    <Link2 className='h-4 w-4 shrink-0 text-tertiary-token' />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </ContentSurfaceCard>

        <ContentSurfaceCard className='p-5'>
          <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
            Recent releases
          </p>
          <div className='mt-3 space-y-2'>
            {(discoverySnapshot?.releases ?? []).length === 0 ? (
              <p className='text-sm text-secondary-token'>
                Releases will appear here as soon as discovery finishes.
              </p>
            ) : (
              discoverySnapshot?.releases.map(release => (
                <div
                  key={release.id}
                  className='flex items-center gap-3 rounded-2xl bg-surface-0 px-3 py-2'
                >
                  {release.artworkUrl ? (
                    <Image
                      src={release.artworkUrl}
                      alt=''
                      width={40}
                      height={40}
                      className='h-10 w-10 rounded-xl object-cover'
                      unoptimized
                    />
                  ) : (
                    <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-surface-1 text-tertiary-token'>
                      <Disc3 className='h-4 w-4' />
                    </div>
                  )}
                  <div className='min-w-0'>
                    <p className='truncate text-sm font-[560] text-primary-token'>
                      {release.title}
                    </p>
                    <p className='text-xs text-secondary-token'>
                      {release.releaseDate
                        ? new Date(release.releaseDate).getFullYear()
                        : 'New release'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ContentSurfaceCard>
      </div>
    </aside>
  );
}

export function OnboardingV2Form({
  existingAvatarUrl = null,
  existingAvatarQuality = null,
  existingBio = null,
  existingGenres = null,
  initialDisplayName = '',
  initialHandle = '',
  initialProfileId = null,
  initialResumeStep = null,
  isReservedHandle = false,
  shouldAutoSubmitHandle = false,
  userEmail = null,
  userId,
}: Readonly<OnboardingV2FormProps>) {
  const router = useRouter();
  void existingAvatarQuality;
  const searchParams = useSearchParams();
  const normalizedInitialHandle = initialHandle.trim().toLowerCase();
  const initialStep = normalizeResumeStep(initialResumeStep);

  const [profileHandle, setProfileHandle] = useState(normalizedInitialHandle);
  const [profileId, setProfileId] = useState<string | null>(initialProfileId);
  const [currentStep, setCurrentStep] = useState<StepId>(
    initialStep ?? (initialProfileId ? 'spotify' : 'handle')
  );
  const [selectedArtist, setSelectedArtist] = useState<SelectedArtist | null>(
    null
  );
  const [discoverySnapshot, setDiscoverySnapshot] =
    useState<DiscoverySnapshot | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);
  const [isArtistConnectPending, setIsArtistConnectPending] = useState(false);
  const [lateArrivals, setLateArrivals] = useState<LateArrival[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [anythingElse, setAnythingElse] = useState('');
  const handleInputRef = useRef<HTMLInputElement | null>(null);
  const stageStartedAtRef = useRef<number>(Date.now());
  const selectedArtistRef = useRef<SelectedArtist | null>(selectedArtist);
  const currentStepRef = useRef<StepId>(currentStep);
  const discoverySnapshotRef = useRef<DiscoverySnapshot | null>(null);
  const lateArrivalIdsRef = useRef<Set<string>>(new Set());
  const didResolveInitialResumeRef = useRef(false);
  const predictedAutoConnectSelectionRef = useRef<SelectedArtist | null>(
    normalizeSelectedArtist(extractSignupClaimArtistSelection())
  );

  const { handleValidation, setHandleValidation, handle, validateHandle } =
    useHandleValidation({
      fullName: initialDisplayName,
      normalizedInitialHandle,
    });

  const {
    results: artistResults,
    search,
    state: artistSearchState,
    clear: clearArtistSearch,
  } = useArtistSearchQuery();

  useEffect(() => {
    selectedArtistRef.current = selectedArtist;
  }, [selectedArtist]);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    if (currentStep === 'handle') {
      handleInputRef.current?.focus();
    }
  }, [currentStep]);

  const handleStepCtaDisabledReason = useMemo(() => {
    if (!profileHandle) return 'Enter a handle to continue';
    if (!handleValidation.clientValid) {
      return handleValidation.error || 'Handle is invalid';
    }
    if (handleValidation.checking) return 'Checking availability...';
    if (!handleValidation.available) {
      return handleValidation.error || 'Handle is taken';
    }
    return null;
  }, [handleValidation, profileHandle]);

  useEffect(() => {
    if (!profileHandle) {
      setHandleValidation({
        available: false,
        checking: false,
        clientValid: false,
        error: null,
        suggestions: [],
      });
      return;
    }

    validateHandle(profileHandle);
  }, [profileHandle, setHandleValidation, validateHandle]);

  const goToNextHandleStep = useCallback(() => {
    const predictedSelection = predictedAutoConnectSelectionRef.current;

    if (predictedSelection) {
      setSelectedArtist(previous => previous ?? predictedSelection);
      setCurrentStep('artist-confirm');
      return;
    }

    setCurrentStep('spotify');
  }, []);

  const onboardingStartedAtRef = useRef(Date.now());

  const {
    autoSubmitClaimed,
    handleSubmit,
    isConnecting,
    isEnriching,
    isPendingSubmit,
    state,
  } = useOnboardingSubmit({
    fullName: initialDisplayName,
    goToNextStep: goToNextHandleStep,
    handle,
    handleInput: profileHandle,
    handleValidation,
    isReservedHandle,
    onAutoConnectStarted: selection => {
      setSelectedArtist(normalizeSelectedArtist(selection));
      setCurrentStep('artist-confirm');
    },
    onCompleted: result => {
      setProfileId(result.profileId);
    },
    onboardingStartedAtMs: onboardingStartedAtRef.current,
    setProfileReadyHandle: setProfileHandle,
    shouldAutoSubmitHandle,
    userEmail,
    userId,
  });

  const refreshDiscovery = useCallback(
    async (signal?: AbortSignal) => {
      if (!profileId) return;

      setIsDiscoveryLoading(true);
      setDiscoveryError(null);

      try {
        const nextSnapshot = await fetchDiscoverySnapshot(profileId, signal);
        const previousSnapshot = discoverySnapshotRef.current;
        discoverySnapshotRef.current = nextSnapshot;
        setDiscoverySnapshot(nextSnapshot);
        setSelectedArtist(current =>
          mergeSelectedArtist(current, nextSnapshot.selectedSpotifyProfile)
        );

        if (!previousSnapshot) {
          return;
        }

        const late = collectLateArrivals(
          previousSnapshot,
          nextSnapshot,
          currentStepRef.current
        );

        if (late.length > 0) {
          setLateArrivals(previous => {
            return mergeLateArrivals(previous, late, lateArrivalIdsRef.current);
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setDiscoveryError(getDiscoveryErrorMessage(error));
      } finally {
        setIsDiscoveryLoading(false);
      }
    },
    [profileId]
  );

  useEffect(() => {
    if (!profileId) return;

    const shouldPoll =
      currentStep === 'artist-confirm' ||
      currentStep === 'dsp' ||
      currentStep === 'social' ||
      currentStep === 'releases' ||
      currentStep === 'late-arrivals' ||
      currentStep === 'profile-ready';

    if (!shouldPoll) return;

    const controller = new AbortController();
    refreshDiscovery(controller.signal);

    const intervalId = globalThis.setInterval(() => {
      if (
        currentStepRef.current === 'dsp' ||
        currentStepRef.current === 'social' ||
        currentStepRef.current === 'releases'
      ) {
        const elapsed = Date.now() - stageStartedAtRef.current;
        if (elapsed >= DISCOVERY_STAGE_TIMEOUT_MS) {
          return;
        }
      }

      refreshDiscovery(controller.signal);
    }, DISCOVERY_POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      globalThis.clearInterval(intervalId);
    };
  }, [currentStep, profileId, refreshDiscovery]);

  useEffect(() => {
    if (didResolveInitialResumeRef.current) return;
    if (!profileId) {
      didResolveInitialResumeRef.current = true;
      return;
    }
    if (!discoverySnapshot) return;

    didResolveInitialResumeRef.current = true;

    if (initialStep) {
      return;
    }

    if (discoverySnapshot.selectedSpotifyProfile) {
      setCurrentStep('dsp');
      return;
    }

    setCurrentStep('spotify');
  }, [discoverySnapshot, initialStep, profileId]);

  useEffect(() => {
    stageStartedAtRef.current = Date.now();
  }, [currentStep]);

  useEffect(() => {
    const currentQueryString = searchParams.toString();
    const resumeValue = getResumeQueryValue(currentStep);
    const params = new URLSearchParams(currentQueryString);

    if (resumeValue) {
      params.set('resume', resumeValue);
    } else {
      params.delete('resume');
    }

    const nextQueryString = params.toString();
    if (nextQueryString === currentQueryString) {
      return;
    }

    startTransition(() => {
      router.replace(
        nextQueryString
          ? `${APP_ROUTES.ONBOARDING}?${nextQueryString}`
          : APP_ROUTES.ONBOARDING,
        { scroll: false }
      );
    });
  }, [currentStep, router, searchParams]);

  const connectArtist = useCallback(
    async (artist: SelectedArtist) => {
      if (!profileId) return;

      clearArtistSearch();
      setSearchInput('');
      setSelectedArtist(artist);
      setCurrentStep('artist-confirm');
      setIsArtistConnectPending(true);
      setDiscoveryError(null);

      const [connectResult] = await Promise.allSettled([
        connectOnboardingSpotifyArtist({
          artistName: artist.name,
          includeTracks: false,
          profileId,
          skipMusicFetchEnrichment: true,
          spotifyArtistId: artist.id,
          spotifyArtistUrl: artist.url,
        }),
        enrichProfileFromDsp(artist.id, artist.url),
      ]);

      if (connectResult.status === 'rejected' || !connectResult.value.success) {
        setIsArtistConnectPending(false);
        setCurrentStep('spotify');
        setDiscoveryError(
          connectResult.status === 'fulfilled'
            ? connectResult.value.message
            : 'Failed to connect your Spotify artist.'
        );
        return;
      }

      setIsArtistConnectPending(false);
      await refreshDiscovery();
    },
    [clearArtistSearch, profileId, refreshDiscovery]
  );

  const handleArtistInput = useCallback(
    (value: string) => {
      setSearchInput(value);

      const directArtistId = extractSpotifyArtistId(value);
      if (directArtistId) {
        connectArtist({
          id: directArtistId,
          imageUrl: null,
          name: '',
          url: `https://open.spotify.com/artist/${directArtistId}`,
        });
        return;
      }

      search(value);
    },
    [connectArtist, search]
  );

  const advanceFromStep = useCallback(() => {
    setCurrentStep(previous => {
      switch (previous) {
        case 'artist-confirm':
          return 'upgrade';
        case 'upgrade':
          return 'dsp';
        case 'dsp':
          return 'social';
        case 'social':
          return 'releases';
        case 'releases':
          return lateArrivals.length > 0 ? 'late-arrivals' : 'profile-ready';
        case 'late-arrivals':
          return 'profile-ready';
        default:
          return previous;
      }
    });
  }, [lateArrivals.length]);

  useEffect(() => {
    if (currentStep === 'dsp' && !hasBlockingDspItems(discoverySnapshot)) {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    if (
      currentStep === 'social' &&
      !hasBlockingSocialItems(discoverySnapshot)
    ) {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    if (currentStep === 'releases') {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    if (currentStep === 'dsp' || currentStep === 'social') {
      const timeoutId = globalThis.setTimeout(() => {
        advanceFromStep();
      }, DISCOVERY_STAGE_TIMEOUT_MS);
      return () => globalThis.clearTimeout(timeoutId);
    }

    return undefined;
  }, [advanceFromStep, currentStep, discoverySnapshot]);

  const runDiscoveryMutation = useCallback(
    async ({
      body,
      errorMessage,
      method,
      url,
    }: {
      body: Record<string, unknown>;
      errorMessage: string;
      method: 'PATCH' | 'POST';
      url: string;
    }) => {
      setDiscoveryError(null);

      try {
        const response = await fetch(url, {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
          method,
        });

        if (!response.ok) {
          setDiscoveryError(errorMessage);
          return;
        }

        await refreshDiscovery();
      } catch {
        setDiscoveryError(errorMessage);
      }
    },
    [refreshDiscovery]
  );

  const handleConfirmDsp = useCallback(
    async (matchId: string) => {
      if (!profileId) return;

      await runDiscoveryMutation({
        body: { profileId },
        errorMessage: 'Failed to confirm DSP match.',
        method: 'POST',
        url: `/api/dsp/matches/${matchId}/confirm`,
      });
    },
    [profileId, runDiscoveryMutation]
  );

  const handleRejectDsp = useCallback(
    async (matchId: string) => {
      if (!profileId) return;

      await runDiscoveryMutation({
        body: { profileId },
        errorMessage: 'Failed to reject DSP match.',
        method: 'POST',
        url: `/api/dsp/matches/${matchId}/reject`,
      });
    },
    [profileId, runDiscoveryMutation]
  );

  const handleAcceptSocial = useCallback(
    async (item: DiscoverySocialItem) => {
      if (!profileId) return;

      if (item.kind === 'suggestion') {
        await runDiscoveryMutation({
          body: { profileId },
          errorMessage: 'Failed to add suggested social link.',
          method: 'POST',
          url: `/api/suggestions/social-links/${item.id}/approve`,
        });
      } else {
        await runDiscoveryMutation({
          body: {
            action: 'accept',
            expectedVersion: item.version ?? 1,
            linkId: item.id,
            profileId,
          },
          errorMessage: 'Failed to accept social link.',
          method: 'PATCH',
          url: '/api/dashboard/social-links',
        });
      }
    },
    [profileId, runDiscoveryMutation]
  );

  const handleDismissSocial = useCallback(
    async (item: DiscoverySocialItem) => {
      if (!profileId) return;

      if (item.kind === 'suggestion') {
        await runDiscoveryMutation({
          body: { profileId },
          errorMessage: 'Failed to dismiss suggested social link.',
          method: 'POST',
          url: `/api/suggestions/social-links/${item.id}/reject`,
        });
      } else {
        await runDiscoveryMutation({
          body: {
            action: 'dismiss',
            expectedVersion: item.version ?? 1,
            linkId: item.id,
            profileId,
          },
          errorMessage: 'Failed to dismiss social link.',
          method: 'PATCH',
          url: '/api/dashboard/social-links',
        });
      }
    },
    [profileId, runDiscoveryMutation]
  );

  const previewSnapshot = useMemo(() => {
    const profile = discoverySnapshot?.profile;
    const username =
      profile?.username || profileHandle || normalizedInitialHandle;

    return {
      activeSinceYear: profile?.activeSinceYear ?? null,
      avatarUrl: profile?.avatarUrl ?? existingAvatarUrl,
      bio: profile?.bio ?? existingBio,
      displayName:
        profile?.displayName ||
        selectedArtist?.name ||
        initialDisplayName ||
        username,
      dspConnections: {
        appleMusic: {
          artistName: null,
          connected: profile?.appleMusicConnected ?? false,
        },
        spotify: {
          artistName: selectedArtist?.name || null,
          connected: Boolean(
            selectedArtist || discoverySnapshot?.selectedSpotifyProfile
          ),
        },
      },
      genres: profile?.genres ?? existingGenres,
      hometown: profile?.hometown ?? null,
      links: (discoverySnapshot?.socialItems ?? [])
        .filter(item => item.kind === 'link' && item.state === 'active')
        .map(item => ({
          id: item.id,
          isVisible: true,
          platform: item.platform,
          title: item.platformLabel,
          url: item.url,
        })),
      location: profile?.location ?? null,
      profilePath: `/${username}`,
      username,
    };
  }, [
    discoverySnapshot,
    existingAvatarUrl,
    existingBio,
    existingGenres,
    initialDisplayName,
    normalizedInitialHandle,
    profileHandle,
    selectedArtist,
  ]);

  const handleOpenDashboard = useCallback(() => {
    try {
      globalThis.sessionStorage?.setItem(
        ONBOARDING_PREVIEW_SNAPSHOT_KEY,
        JSON.stringify(previewSnapshot)
      );
      if (anythingElse.trim()) {
        globalThis.sessionStorage?.setItem(
          ONBOARDING_WELCOME_REPLY_KEY,
          anythingElse.trim()
        );
      } else {
        globalThis.sessionStorage?.removeItem(ONBOARDING_WELCOME_REPLY_KEY);
      }
    } catch {
      // sessionStorage may be unavailable in restricted contexts
    }

    const nextUrl = `${APP_ROUTES.CHAT}?from=onboarding&panel=profile`;
    if (
      'startViewTransition' in document &&
      typeof document.startViewTransition === 'function'
    ) {
      document.startViewTransition(() => {
        router.push(nextUrl);
      });
      return;
    }

    router.push(nextUrl);
  }, [anythingElse, previewSnapshot, router]);

  const handleGoBack = useCallback(() => {
    if (currentStep === 'spotify') {
      setCurrentStep('handle');
      return;
    }

    if (currentStep === 'artist-confirm') {
      setCurrentStep('spotify');
      return;
    }

    if (currentStep === 'upgrade') {
      setCurrentStep('artist-confirm');
    }
  }, [currentStep]);

  const renderSpotifySearchResults = (results: SpotifyArtistResult[]) => {
    if (results.length === 0) return null;

    return (
      <ContentSurfaceCard
        as='ul'
        className='absolute top-full right-0 left-0 z-10 mt-2 max-h-[280px] overflow-y-auto p-1'
      >
        {results.map(artist => (
          <li key={artist.id}>
            <button
              type='button'
              onClick={() => {
                connectArtist({
                  id: artist.id,
                  imageUrl: artist.imageUrl ?? null,
                  name: artist.name,
                  url: artist.url,
                });
              }}
              className='flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-surface-0'
            >
              {artist.imageUrl ? (
                <Image
                  src={artist.imageUrl}
                  alt=''
                  width={40}
                  height={40}
                  className='h-10 w-10 rounded-full object-cover'
                  unoptimized
                />
              ) : (
                <div className='flex h-10 w-10 items-center justify-center rounded-full bg-surface-0 text-tertiary-token'>
                  <Music2 className='h-4 w-4' />
                </div>
              )}

              <div className='min-w-0 flex-1'>
                <p className='truncate text-sm font-[560] text-primary-token'>
                  {artist.name}
                </p>
                <p className='text-xs text-secondary-token'>
                  {artist.followers
                    ? `${artist.followers.toLocaleString()} followers`
                    : 'Spotify'}
                </p>
              </div>

              <ArrowRight className='h-4 w-4 shrink-0 text-tertiary-token' />
            </button>
          </li>
        ))}
      </ContentSurfaceCard>
    );
  };

  const stepContent = (() => {
    switch (currentStep) {
      case 'handle':
        return (
          <OnboardingHandleStep
            autoSubmitClaimed={autoSubmitClaimed}
            ctaDisabledReason={handleStepCtaDisabledReason}
            handleInput={profileHandle}
            handleValidation={handleValidation}
            inputRef={handleInputRef}
            isPendingSubmit={isPendingSubmit}
            isReservedHandle={isReservedHandle}
            isSubmitting={state.isSubmitting}
            isTransitioning={false}
            onHandleChange={setProfileHandle}
            onSubmit={handleSubmit}
            stateError={state.error}
            title='Choose your handle'
            prompt='This is the username fans will use to find you.'
          />
        );

      case 'spotify':
        return (
          <StepFrame
            title='Pick your Spotify artist'
            prompt='Search for your artist page or paste a Spotify artist URL. We will start importing as soon as you choose one.'
          >
            <div className='relative'>
              <div className='flex items-center gap-3 rounded-[22px] border border-subtle bg-surface-1 px-4 py-3'>
                <Music2 className='h-4 w-4 shrink-0 text-tertiary-token' />
                <input
                  autoCapitalize='none'
                  autoComplete='off'
                  autoCorrect='off'
                  className='min-w-0 flex-1 bg-transparent text-sm text-primary-token outline-none placeholder:text-tertiary-token'
                  onChange={event => handleArtistInput(event.target.value)}
                  placeholder='Search by artist name or paste a Spotify link'
                  spellCheck={false}
                  type='text'
                  value={searchInput}
                />
                {artistSearchState === 'loading' || isArtistConnectPending ? (
                  <LoadingSpinner size='sm' className='text-tertiary-token' />
                ) : null}
              </div>
              {renderSpotifySearchResults(artistResults)}
            </div>

            <ContentSurfaceCard className='p-5'>
              <p className='text-sm font-[560] text-primary-token'>
                What happens next
              </p>
              <ul className='mt-3 space-y-2 text-sm leading-6 text-secondary-token'>
                <li>We claim the Spotify artist on your profile right away.</li>
                <li>Cross-platform discovery starts in the background.</li>
                <li>
                  You can reselect a different artist if you picked the wrong
                  one.
                </li>
              </ul>
            </ContentSurfaceCard>
          </StepFrame>
        );

      case 'artist-confirm':
        return (
          <StepFrame
            title='Spotify is connected'
            prompt='We are importing your core profile data now. You can keep going while the rest of discovery catches up.'
            actions={
              <>
                <Button
                  onClick={() => setCurrentStep('spotify')}
                  variant='secondary'
                >
                  Choose a different artist
                </Button>
                <Button onClick={advanceFromStep}>
                  Continue
                  <ArrowRight className='ml-1 h-4 w-4' />
                </Button>
              </>
            }
          >
            <SelectedArtistCard
              artist={selectedArtist}
              isLoading={
                isArtistConnectPending ||
                isConnecting ||
                isEnriching ||
                isDiscoveryLoading
              }
            />
          </StepFrame>
        );

      case 'upgrade':
        return (
          <StepFrame
            title='Want the full profile from day one?'
            prompt='You can keep going for free, or unlock the paid plan before you land in the dashboard.'
            actions={
              <>
                <Button onClick={advanceFromStep} variant='secondary'>
                  Continue free
                </Button>
                <Button
                  onClick={() => {
                    router.push(
                      `${APP_ROUTES.ONBOARDING_CHECKOUT}?source=organic&returnTo=${encodeURIComponent(
                        `${APP_ROUTES.ONBOARDING}?resume=dsp`
                      )}`
                    );
                  }}
                >
                  Upgrade now
                </Button>
              </>
            }
          >
            <ContentSurfaceCard className='p-5'>
              <p className='text-sm font-[560] text-primary-token'>
                You can still finish discovery first.
              </p>
              <p className='mt-2 text-sm leading-6 text-secondary-token'>
                Checkout returns directly to discovery, so this is a short
                detour rather than a separate flow.
              </p>
            </ContentSurfaceCard>
          </StepFrame>
        );

      case 'dsp':
        return (
          <StepFrame
            title='Review DSP matches'
            prompt='Jovie is checking for your presence on other music platforms.'
            actions={
              <Button onClick={() => refreshDiscovery()} variant='secondary'>
                <RefreshCw className='mr-1 h-4 w-4' />
                Refresh
              </Button>
            }
          >
            {discoveryError ? (
              <ContentSurfaceCard className='border-error/50 p-4 text-sm text-secondary-token'>
                {discoveryError}
              </ContentSurfaceCard>
            ) : null}

            {discoverySnapshot?.dspItems.length ? (
              discoverySnapshot.dspItems.map(item => (
                <ContentSurfaceCard key={item.id} className='p-5'>
                  <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='min-w-0'>
                      <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                        {item.providerLabel}
                      </p>
                      <p className='truncate text-base font-[580] text-primary-token'>
                        {item.externalArtistName || 'Suggested artist'}
                      </p>
                      <p className='text-sm text-secondary-token'>
                        {getDspStatusLabel(item.status)}
                      </p>
                    </div>

                    <div className='flex flex-wrap gap-2'>
                      {item.externalArtistUrl ? (
                        <Button asChild size='sm' variant='secondary'>
                          <Link
                            href={item.externalArtistUrl}
                            target='_blank'
                            rel='noreferrer'
                          >
                            Open
                          </Link>
                        </Button>
                      ) : null}

                      {item.status === 'suggested' ? (
                        <>
                          <Button
                            onClick={() => {
                              handleRejectDsp(item.id);
                            }}
                            size='sm'
                            variant='secondary'
                          >
                            Reject
                          </Button>
                          <Button
                            onClick={() => {
                              handleConfirmDsp(item.id);
                            }}
                            size='sm'
                          >
                            Accept
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </ContentSurfaceCard>
              ))
            ) : (
              <EmptyState
                title={
                  discoverySnapshot?.hasPendingDiscoveryJob
                    ? 'Still discovering DSPs'
                    : 'No additional DSP matches yet'
                }
                body='You can keep going. New matches that arrive later will still be surfaced before you land in the dashboard.'
              />
            )}
          </StepFrame>
        );

      case 'social':
        return (
          <StepFrame
            title='Review social links'
            prompt='We found social profiles and candidate links that may belong on your page.'
            actions={
              <Button onClick={() => refreshDiscovery()} variant='secondary'>
                <RefreshCw className='mr-1 h-4 w-4' />
                Refresh
              </Button>
            }
          >
            {(discoverySnapshot?.socialItems.length ?? 0) > 0 ? (
              discoverySnapshot?.socialItems.map(item => {
                const isPending =
                  item.kind === 'suggestion'
                    ? item.state === 'pending'
                    : item.state === 'suggested';

                return (
                  <ContentSurfaceCard
                    key={`${item.kind}:${item.id}`}
                    className='p-5'
                  >
                    <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                      <div className='min-w-0'>
                        <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                          {item.platformLabel}
                        </p>
                        <p className='truncate text-base font-[580] text-primary-token'>
                          {item.username || item.url}
                        </p>
                        <p className='text-sm text-secondary-token'>
                          {isPending
                            ? 'Needs your review'
                            : 'Already active on your profile'}
                        </p>
                      </div>

                      <div className='flex flex-wrap gap-2'>
                        <Button asChild size='sm' variant='secondary'>
                          <Link
                            href={item.url}
                            target='_blank'
                            rel='noreferrer'
                          >
                            Open
                          </Link>
                        </Button>
                        {isPending ? (
                          <>
                            <Button
                              onClick={() => {
                                handleDismissSocial(item);
                              }}
                              size='sm'
                              variant='secondary'
                            >
                              Dismiss
                            </Button>
                            <Button
                              onClick={() => {
                                handleAcceptSocial(item);
                              }}
                              size='sm'
                            >
                              Add
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </ContentSurfaceCard>
                );
              })
            ) : (
              <EmptyState
                title='No social suggestions yet'
                body='If discovery turns up more profiles after this step, they will appear in the final summary before you enter the dashboard.'
              />
            )}
          </StepFrame>
        );

      case 'releases':
        return (
          <StepFrame
            title='Your release preview'
            prompt='This is what Jovie pulled in from your catalog so far.'
            actions={
              <Button onClick={advanceFromStep}>
                Continue
                <ArrowRight className='ml-1 h-4 w-4' />
              </Button>
            }
          >
            {discoverySnapshot?.releases.length ? (
              discoverySnapshot.releases.map(release => (
                <ContentSurfaceCard key={release.id} className='p-5'>
                  <div className='flex items-center gap-4'>
                    {release.artworkUrl ? (
                      <Image
                        src={release.artworkUrl}
                        alt=''
                        width={64}
                        height={64}
                        className='h-16 w-16 rounded-2xl object-cover'
                        unoptimized
                      />
                    ) : (
                      <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-0 text-tertiary-token'>
                        <Disc3 className='h-5 w-5' />
                      </div>
                    )}
                    <div className='min-w-0'>
                      <p className='truncate text-base font-[580] text-primary-token'>
                        {release.title}
                      </p>
                      <p className='text-sm text-secondary-token'>
                        {release.releaseDate
                          ? new Date(release.releaseDate).toLocaleDateString()
                          : 'Release date pending'}
                      </p>
                    </div>
                  </div>
                </ContentSurfaceCard>
              ))
            ) : (
              <EmptyState
                title='No releases have landed yet'
                body='That usually means enrichment is still catching up. You can keep going and the dashboard will continue hydrating in the background.'
              />
            )}
          </StepFrame>
        );

      case 'late-arrivals':
        return (
          <StepFrame
            title='A few more things showed up'
            prompt='Discovery kept running while you moved through onboarding.'
            actions={
              <Button onClick={advanceFromStep}>
                Finish setup
                <ArrowRight className='ml-1 h-4 w-4' />
              </Button>
            }
          >
            {lateArrivals.map(item => (
              <ContentSurfaceCard key={item.id} className='p-5'>
                <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                  {item.subtitle}
                </p>
                <p className='mt-1 text-base font-[580] text-primary-token'>
                  {item.title}
                </p>
              </ContentSurfaceCard>
            ))}
          </StepFrame>
        );

      case 'profile-ready':
        return (
          <StepFrame
            title='Your profile is ready'
            prompt='The dashboard is next. We will carry your preview straight through the route transition.'
            actions={
              <Button onClick={handleOpenDashboard}>
                Open dashboard
                <ArrowRight className='ml-1 h-4 w-4' />
              </Button>
            }
          >
            <ContentSurfaceCard className='p-5'>
              <div className='grid gap-4 sm:grid-cols-3'>
                <div>
                  <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                    Releases
                  </p>
                  <p className='mt-1 text-2xl font-[620] text-primary-token'>
                    {discoverySnapshot?.counts.releaseCount ?? 0}
                  </p>
                </div>
                <div>
                  <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                    DSPs
                  </p>
                  <p className='mt-1 text-2xl font-[620] text-primary-token'>
                    {discoverySnapshot?.counts.dspCount ?? 0}
                  </p>
                </div>
                <div>
                  <p className='text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary-token'>
                    Social
                  </p>
                  <p className='mt-1 text-2xl font-[620] text-primary-token'>
                    {discoverySnapshot?.counts.activeSocialCount ?? 0}
                  </p>
                </div>
              </div>
            </ContentSurfaceCard>

            <ContentSurfaceCard className='p-5'>
              <label
                className='text-sm font-[560] text-primary-token'
                htmlFor='onboarding-anything-else'
              >
                Anything else I should know?
              </label>
              <textarea
                id='onboarding-anything-else'
                className='mt-3 min-h-[120px] w-full rounded-[20px] border border-subtle bg-surface-1 px-4 py-3 text-sm text-primary-token outline-none placeholder:text-tertiary-token'
                onChange={event => setAnythingElse(event.target.value)}
                placeholder='Optional context for your first Jovie chat…'
                value={anythingElse}
              />
            </ContentSurfaceCard>
          </StepFrame>
        );
    }
  })();

  return (
    <div className='min-h-screen bg-page text-primary-token [color-scheme:dark]'>
      <div className='mx-auto flex min-h-screen w-full max-w-[1440px] gap-10 px-4 py-8 sm:px-6 lg:px-8'>
        <div className='min-w-0 flex-1'>
          {(currentStep === 'spotify' ||
            currentStep === 'artist-confirm' ||
            currentStep === 'upgrade') && (
            <AuthBackButton onClick={handleGoBack} ariaLabel='Go back' />
          )}

          <div
            className={cn(
              'rounded-[32px] border border-(--linear-app-frame-seam) bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] px-5 py-6 shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:px-8 sm:py-8',
              currentStep === 'handle' ? 'min-h-[560px]' : 'min-h-[520px]'
            )}
          >
            {stepContent}
          </div>
        </div>

        <PreviewPanel
          discoverySnapshot={discoverySnapshot}
          existingAvatarUrl={existingAvatarUrl}
          existingBio={existingBio}
          existingGenres={existingGenres}
          selectedArtist={selectedArtist}
        />
      </div>
    </div>
  );
}
