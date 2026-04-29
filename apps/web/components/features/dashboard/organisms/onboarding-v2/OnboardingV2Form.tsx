'use client';

import { Button } from '@jovie/ui';
import { ArrowRight, Disc3, Lock, Music2, RefreshCw } from 'lucide-react';
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
import { connectOnboardingSpotifyArtist } from '@/app/onboarding/actions/connect-spotify';
import { enrichProfileFromDsp } from '@/app/onboarding/actions/enrich-profile';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { OnboardingExperienceShell } from '@/components/features/onboarding/OnboardingExperienceShell';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getProfileUrl } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { OnboardingHandleStep } from '@/features/dashboard/organisms/onboarding';
import { useHandleValidation } from '@/features/dashboard/organisms/onboarding-v2/shared/useHandleValidation';
import {
  type AutoConnectedArtistSelection,
  extractSignupClaimArtistSelection,
  useOnboardingSubmit,
} from '@/features/dashboard/organisms/onboarding-v2/shared/useOnboardingSubmit';
import { copyToClipboard } from '@/hooks/useClipboard';
import {
  DEFAULT_UPSELL_PLAN,
  getPlanIntent,
  isPaidIntent,
} from '@/lib/auth/plan-intent';
import {
  buildInstagramBioLinkFromHandle,
  INSTAGRAM_EDIT_PROFILE_URL,
  postDistributionEvent,
} from '@/lib/distribution/instagram-activation';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type {
  OnboardingBlockingReason as DiscoveryBlockingReason,
  SpotifyImportStatus as DiscoveryImportStatus,
  OnboardingReadinessPhase as DiscoveryReadinessPhase,
} from '@/lib/onboarding/discovery-readiness';
import {
  ONBOARDING_PREVIEW_SNAPSHOT_KEY,
  ONBOARDING_WELCOME_REPLY_KEY,
} from '@/lib/onboarding/session-keys';
import { type SpotifyArtistResult, useArtistSearchQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

const DISCOVERY_POLL_INTERVAL_MS = 1200;
const DISCOVERY_AUTO_ADVANCE_MS = 800;

/**
 * Reserved Spotify artist IDs — top DJs.
 * These appear in search results as "unavailable" to create social proof.
 */
const RESERVED_SPOTIFY_IDS = new Set([
  '1Cs0zKBU1kc0i8ypK3B9ai', // David Guetta
  '60d24wfXkVzDSfLS6hyCjZ', // Martin Garrix
  '64KEffDW9EtZ1y2vBYgq8T', // Marshmello
  '1vCWHaC5f2uS3yhpwWbIA6', // Avicii
  '6VuMaDnrHyPL1p4EHjYLi7', // Charlie Puth (crossover DJ/producer)
  '5fMUXHkw8R8eOP2RNVYEZX', // Diplo
  '4q3ewBCX7sLwd24euuV69X', // Bad Bunny
  '1McMsnEElThX1knmY4oliG', // Olivia Rodrigo
  '738wLrAtLtCtFOLvQBXOXp', // Kygo
  '0EmeFodog0BfCgMzAIvKQp', // Skrillex
  '5he5w2lnU9x7JFhnwcekXX', // Tiësto
  '2o5jDhtHVPhrJdv3UGqLyI', // Armin van Buuren
  '6nB0iY1cjSY1KyhYyuIIKH', // Deadmau5
  '4YLtL2W80ytGNMKnW7ALBx', // Calvin Harris
  '6hyMWrxGBsOx6sWcVj1DqP', // Zedd
  '20s0P9QLxGqKuCsGwFsp7w', // Alesso
  '4AVFqumd2ogHFlRbKIjp1t', // Afrojack
  '77AiFEVeAVj2ORpC85QVJs', // Steve Aoki
  '4pbG9SUmhZhrQKoSCxZyHc', // Don Diablo
  '5YGY8feqx7naU7z4HrwZM6', // Miley Cyrus
  '540vIaP2JwjQb9dm3aArA4', // DJ Snake
  '2wY79sveU1sp5g7SokKOiI', // Sam Smith
  '2ye2Wgw4gimLv2eAKyk1NB', // Metallica
  '23fqKkggKUBHNkbKtXEls4', // Kylie Minogue
  '0C8ZW7ezQVs4URX5aX7Kqx', // Selena Gomez
  '2YZyLoL8N0Wb9xBt1NhZWg', // Kendrick Lamar
  '3TVXtAsR1Inumwj472S9r4', // Drake
  '06HL4z0CvFAxyc27GXpf02', // Taylor Swift
  '6eUKZXaKkcviH0Ku9w2n3V', // Ed Sheeran
  '1HY2Jd0NmPuamShAr6KMms', // Lady Gaga
  '4gzpq5DPGxSnKTe4SA8HAU', // Coldplay
  '3WrFJ7ztbogyGnTHbHJFl2', // The Beatles
  '0du5cEVh5yTK9QJze8zA0C', // Bruno Mars
  '4dpARuHxo51G3z768sgnrY', // Adele
  '66CXWjxzNUsdJxJ2JdwvnR', // Ariana Grande
  '7dGJo4pcD2V6oG8kP0tJRR', // Eminem
  '3Nrfpe0tUJi4K4DXYWgMUX', // BTS
  '6qqNVTkY8uBg9cP3Jd7DAH', // Billie Eilish
  '1Xyo4u8uXC1ZmMpatF05PJ', // The Weeknd
  '5K4W6rqBFWDnAN6FQUkS6x', // Kanye West
]);

function isReservedArtist(artist: SpotifyArtistResult): boolean {
  return artist.isClaimed === true || RESERVED_SPOTIFY_IDS.has(artist.id);
}

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

const STEP_ORDER: StepId[] = [
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

const SIDEBAR_STEPS: ReadonlyArray<
  Readonly<{ id: StepId; label: string; color: string }>
> = [
  { id: 'handle', label: 'Handle', color: '#a78bfa' },
  { id: 'spotify', label: 'Spotify', color: '#1DB954' },
  { id: 'upgrade', label: 'Plan', color: '#f59e0b' },
  { id: 'dsp', label: 'DSPs', color: '#38bdf8' },
  { id: 'social', label: 'Social', color: '#f472b6' },
  { id: 'releases', label: 'Releases', color: '#fb923c' },
  { id: 'profile-ready', label: 'Finish', color: '#34d399' },
];

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

interface StepFrameProps {
  readonly actions?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly prompt?: string;
  readonly title: string;
}

function getSidebarStepState(step: StepId, currentStep: StepId) {
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

function normalizeSidebarCurrentStep(currentStep: StepId): StepId {
  if (currentStep === 'artist-confirm') {
    return 'spotify';
  }

  if (currentStep === 'late-arrivals') {
    return 'releases';
  }

  return currentStep;
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

function getDiscoveryReadiness(snapshot: DiscoverySnapshot | null) {
  return snapshot?.readiness ?? null;
}

function canProceedToDashboard(snapshot: DiscoverySnapshot | null): boolean {
  return Boolean(getDiscoveryReadiness(snapshot)?.canProceedToDashboard);
}

function getBlockingReason(
  snapshot: DiscoverySnapshot | null
): DiscoveryBlockingReason {
  return getDiscoveryReadiness(snapshot)?.blockingReason ?? null;
}

function isReadinessPending(snapshot: DiscoverySnapshot | null): boolean {
  return !canProceedToDashboard(snapshot);
}

function getReadinessMessage(
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
  return STEP_ORDER.indexOf(currentStep) > STEP_ORDER.indexOf(stage);
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
      <div className='space-y-3'>
        <h1 className='text-3xl font-semibold tracking-[-0.04em] text-primary-token sm:text-[2.7rem]'>
          {title}
        </h1>
        {prompt ? (
          <p className='max-w-xl text-sm leading-6 text-secondary-token sm:text-mid'>
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

function FlatPanel({
  children,
  className,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        'border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_72%,transparent)] pb-5',
        className
      )}
    >
      {children}
    </div>
  );
}

function InlineNotice({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className='border-b border-[color-mix(in_oklab,var(--color-destructive)_28%,transparent)] pb-4 text-sm leading-6 text-secondary-token'>
      {children}
    </div>
  );
}

function EmptyState({
  body,
  title,
}: Readonly<{ body: string; title: string }>) {
  return (
    <div className='border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_58%,transparent)] pb-5'>
      <p className='text-sm font-semibold text-primary-token'>{title}</p>
      <p className='mt-1 text-sm leading-6 text-secondary-token'>{body}</p>
    </div>
  );
}

function StepCircleIcon({
  className,
  color,
  state,
}: Readonly<{
  className?: string;
  color: string;
  state: 'complete' | 'current' | 'pending';
}>) {
  let innerShape: React.ReactNode;
  if (state === 'complete') {
    innerShape = (
      <circle cx='12' cy='12' r='10' stroke={color} strokeWidth='2' />
    );
  } else if (state === 'current') {
    innerShape = (
      <>
        {/* Solid left half */}
        <path
          d='M12 2a10 10 0 0 0 0 20'
          stroke={color}
          strokeWidth='2'
          fill='none'
        />
        {/* Dotted right half */}
        <path
          d='M12 2a10 10 0 0 1 0 20'
          stroke={color}
          strokeWidth='2'
          strokeDasharray='2.5 2.5'
          fill='none'
        />
      </>
    );
  } else {
    innerShape = (
      <circle
        cx='12'
        cy='12'
        r='10'
        stroke='currentColor'
        strokeWidth='2'
        strokeDasharray='2.5 2.5'
        opacity={0.35}
      />
    );
  }

  return (
    <svg
      aria-hidden='true'
      className={className}
      viewBox='0 0 24 24'
      fill='none'
    >
      {innerShape}
    </svg>
  );
}

function OnboardingSidebar({
  currentStep,
  onBack,
}: Readonly<{
  currentStep: StepId;
  onBack?: () => void;
}>) {
  const displayStep = normalizeSidebarCurrentStep(currentStep);
  const currentIndex = SIDEBAR_STEPS.findIndex(s => s.id === displayStep);
  const currentLabel =
    SIDEBAR_STEPS[currentIndex]?.label ?? SIDEBAR_STEPS[0].label;

  return (
    <nav aria-label='Onboarding steps'>
      {onBack ? (
        <button
          type='button'
          onClick={onBack}
          aria-label='Go back'
          className='mb-3 flex h-7 w-7 items-center justify-center rounded-lg text-tertiary-token transition-colors hover:bg-surface-1 hover:text-primary-token'
        >
          <ArrowRight className='h-4 w-4 rotate-180' />
        </button>
      ) : null}
      {/* Compact progress indicator for small screens */}
      <div className='flex items-center gap-3 sm:hidden'>
        <span className='text-app font-semibold text-primary-token'>
          {currentLabel}
        </span>
        <span className='text-xs text-tertiary-token'>
          {currentIndex + 1}/{SIDEBAR_STEPS.length}
        </span>
        <div className='flex flex-1 gap-1'>
          {SIDEBAR_STEPS.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                'h-1 flex-1 rounded-full',
                i <= currentIndex ? 'bg-primary-token' : 'bg-surface-2'
              )}
            />
          ))}
        </div>
      </div>

      {/* Full step list for sm+ screens */}
      <ul className='hidden space-y-1.5 sm:block'>
        {SIDEBAR_STEPS.map(step => {
          const state = getSidebarStepState(step.id, displayStep);
          const isCurrent = state === 'current';

          return (
            <li key={step.id} aria-current={isCurrent ? 'step' : undefined}>
              <div
                className={cn(
                  'flex items-center gap-3 rounded-xl px-2 py-2 text-app transition-colors',
                  isCurrent
                    ? 'bg-surface-1 text-primary-token'
                    : 'text-secondary-token'
                )}
              >
                <StepCircleIcon
                  className='h-4 w-4 shrink-0'
                  color={state === 'pending' ? 'currentColor' : step.color}
                  state={state}
                />
                <span className='font-semibold'>{step.label}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function OnboardingV2Form({
  assumeInitialHandleAvailable = false,
  existingAvatarUrl = null,
  existingBio = null,
  existingGenres = null,
  initialDisplayName = '',
  initialHandle = '',
  initialProfileId = null,
  initialResumeStep = null,
  isHydrated,
  isReservedHandle = false,
  shouldAutoSubmitHandle = false,
  userEmail = null,
  userId,
  designV1 = false,
}: Readonly<OnboardingV2FormProps>) {
  const router = useRouter();

  const searchParams = useSearchParams();
  const notifications = useNotifications();
  const normalizedInitialHandle = initialHandle.trim().toLowerCase();
  const initialStep =
    initialProfileId !== null && initialProfileId !== undefined
      ? normalizeResumeStep(initialResumeStep)
      : null;

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
  const [didCopyInstagramBioLink, setDidCopyInstagramBioLink] = useState(false);
  const [didOpenInstagram, setDidOpenInstagram] = useState(false);
  const handleInputRef = useRef<HTMLInputElement | null>(null);
  const selectedArtistRef = useRef<SelectedArtist | null>(selectedArtist);
  const currentStepRef = useRef<StepId>(currentStep);
  const discoverySnapshotRef = useRef<DiscoverySnapshot | null>(null);
  const discoveryRequestSeqRef = useRef(0);
  const lateArrivalIdsRef = useRef<Set<string>>(new Set());
  const didResolveInitialResumeRef = useRef(false);
  const handledUpgradeStatusRef = useRef<string | null>(null);
  const didTrackProfileReadyStepViewRef = useRef(false);
  const predictedAutoConnectSelectionRef = useRef<SelectedArtist | null>(
    normalizeSelectedArtist(extractSignupClaimArtistSelection())
  );

  const { handleValidation, setHandleValidation, handle, validateHandle } =
    useHandleValidation({
      assumeInitialHandleAvailable:
        assumeInitialHandleAvailable || Boolean(initialProfileId),
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
    if (!isHydrated) return 'Preparing your handle step...';
    if (!profileHandle) return 'Enter a handle to continue';
    if (!handleValidation.clientValid) {
      return handleValidation.error || 'Handle is invalid';
    }
    if (handleValidation.checking) return 'Checking availability...';
    if (!handleValidation.available) {
      return handleValidation.error || 'Handle is taken';
    }
    return null;
  }, [handleValidation, isHydrated, profileHandle]);

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
    isHydrated,
    isReservedHandle,
    onAutoConnectStarted: selection => {
      setSelectedArtist(normalizeSelectedArtist(selection));
      setCurrentStep('artist-confirm');
    },
    onAutoConnectFailed: message => {
      setDiscoveryError(message);
      setSelectedArtist(
        discoverySnapshotRef.current?.selectedSpotifyProfile ?? null
      );
      // Stay on artist-confirm so the user sees the error in context
      // instead of being bounced back to "Are you on Spotify?"
      if (
        currentStepRef.current === 'spotify' ||
        currentStepRef.current === 'artist-confirm'
      ) {
        setCurrentStep('artist-confirm');
      }
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

      const requestSeq = discoveryRequestSeqRef.current + 1;
      discoveryRequestSeqRef.current = requestSeq;
      setIsDiscoveryLoading(true);

      try {
        const nextSnapshot = await fetchDiscoverySnapshot(profileId, signal);
        if (signal?.aborted || requestSeq !== discoveryRequestSeqRef.current) {
          return;
        }

        // Only clear error on successful fetch — don't clear on poll start
        setDiscoveryError(null);
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

        if (requestSeq !== discoveryRequestSeqRef.current) {
          return;
        }

        setDiscoveryError(getDiscoveryErrorMessage(error));
      } finally {
        if (!signal?.aborted && requestSeq === discoveryRequestSeqRef.current) {
          setIsDiscoveryLoading(false);
        }
      }
    },
    [profileId]
  );

  useEffect(() => {
    if (
      !profileId ||
      currentStep !== 'spotify' ||
      initialStep ||
      didResolveInitialResumeRef.current
    ) {
      return;
    }

    const controller = new AbortController();
    refreshDiscovery(controller.signal).catch(() => {
      // refreshDiscovery is responsible for setting user-facing error state
    });

    return () => {
      controller.abort();
    };
  }, [currentStep, initialStep, profileId, refreshDiscovery]);

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
      setCurrentStep('handle');
      didResolveInitialResumeRef.current = true;
      return;
    }
    if (initialStep) {
      didResolveInitialResumeRef.current = true;
      return;
    }

    if (currentStep !== 'spotify') {
      didResolveInitialResumeRef.current = true;
      return;
    }

    if (!discoverySnapshot) return;

    didResolveInitialResumeRef.current = true;

    if (discoverySnapshot.selectedSpotifyProfile) {
      setCurrentStep('artist-confirm');
      return;
    }

    setCurrentStep('spotify');
  }, [currentStep, discoverySnapshot, initialStep, profileId]);

  useEffect(() => {
    if (currentStep !== 'profile-ready') {
      return;
    }

    if (!discoverySnapshot) {
      return;
    }

    if (canProceedToDashboard(discoverySnapshot)) {
      return;
    }

    setCurrentStep('releases');
  }, [currentStep, discoverySnapshot]);

  useEffect(() => {
    const upgradeStatus = searchParams.get('upgrade');
    if (!upgradeStatus || handledUpgradeStatusRef.current === upgradeStatus) {
      return;
    }

    handledUpgradeStatusRef.current = upgradeStatus;

    if (upgradeStatus === 'cancel') {
      notifications.info('Checkout cancelled. You can keep going for free.');
    } else if (upgradeStatus === 'success') {
      notifications.success('Upgrade complete.');
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('upgrade');

    const nextQueryString = params.toString();
    startTransition(() => {
      router.replace(
        nextQueryString
          ? `${APP_ROUTES.ONBOARDING}?${nextQueryString}`
          : APP_ROUTES.ONBOARDING,
        { scroll: false }
      );
    });
  }, [notifications, router, searchParams]);

  useEffect(() => {
    const currentQueryString = searchParams.toString();
    const resumeValue = getResumeQueryValue(currentStep);
    const params = new URLSearchParams(currentQueryString);
    params.delete('upgrade');

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

      try {
        const connectResult = await connectOnboardingSpotifyArtist({
          artistName: artist.name,
          includeTracks: true,
          profileId,
          spotifyArtistId: artist.id,
          spotifyArtistUrl: artist.url,
        });

        if (!connectResult.success) {
          throw new Error(
            connectResult.message || 'Failed to connect your Spotify artist.'
          );
        }
      } catch (error) {
        setIsArtistConnectPending(false);
        setDiscoveryError(
          error instanceof Error
            ? error.message
            : 'Failed to connect your Spotify artist.'
        );
        // Stay on artist-confirm so the user sees the error in context
        return;
      }

      setIsArtistConnectPending(false);
      void enrichProfileFromDsp(artist.id, artist.url).catch(() => {
        // Best-effort: if enrichment fails, the profile keeps its current name.
      });
      await refreshDiscovery().catch(() => {
        // refreshDiscovery is responsible for setting user-facing error state
      });
    },
    [clearArtistSearch, profileId, refreshDiscovery]
  );

  const handleArtistInput = useCallback(
    (value: string) => {
      setSearchInput(value);
      setDiscoveryError(null);

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

      // Detect URLs and show helpful feedback
      const trimmed = value.trim();
      if (/^https?:\/\/.+/i.test(trimmed)) {
        if (trimmed.includes('spotify.com')) {
          // Spotify URL but not an artist page (track, album, playlist, etc.)
          setDiscoveryError(
            'That looks like a Spotify link, but not an artist page. Paste your Spotify artist URL.'
          );
        } else {
          setDiscoveryError(
            'Only Spotify artist URLs are supported. Paste a link like open.spotify.com/artist/...'
          );
        }
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
          return canProceedToDashboard(discoverySnapshot)
            ? 'upgrade'
            : 'artist-confirm';
        case 'upgrade':
          return canProceedToDashboard(discoverySnapshot) ? 'dsp' : 'upgrade';
        case 'dsp':
          if (isReadinessPending(discoverySnapshot)) {
            return 'dsp';
          }
          return 'social';
        case 'social':
          if (isReadinessPending(discoverySnapshot)) {
            return 'social';
          }
          return 'releases';
        case 'releases':
          if (
            isReadinessPending(discoverySnapshot) ||
            (discoverySnapshot?.counts.releaseCount ?? 0) <= 0
          ) {
            return 'releases';
          }
          return 'profile-ready';
        case 'late-arrivals':
          return canProceedToDashboard(discoverySnapshot)
            ? 'profile-ready'
            : 'releases';
        default:
          return previous;
      }
    });
  }, [discoverySnapshot]);

  useEffect(() => {
    if (
      currentStep === 'artist-confirm' &&
      !isArtistConnectPending &&
      !isConnecting &&
      canProceedToDashboard(discoverySnapshot)
    ) {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    if (currentStep === 'dsp' && canProceedToDashboard(discoverySnapshot)) {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    if (currentStep === 'social' && canProceedToDashboard(discoverySnapshot)) {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    if (
      currentStep === 'releases' &&
      canProceedToDashboard(discoverySnapshot) &&
      (discoverySnapshot?.counts.releaseCount ?? 0) > 0
    ) {
      const timeoutId = globalThis.setTimeout(
        advanceFromStep,
        DISCOVERY_AUTO_ADVANCE_MS
      );
      return () => globalThis.clearTimeout(timeoutId);
    }

    return undefined;
  }, [
    advanceFromStep,
    currentStep,
    discoverySnapshot,
    isArtistConnectPending,
    isConnecting,
  ]);

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
  const publicProfileUrl = useMemo(() => {
    if (!profileHandle) {
      return null;
    }

    return getProfileUrl(profileHandle);
  }, [profileHandle]);
  const instagramBioLink = useMemo(() => {
    if (!profileHandle) {
      return null;
    }

    return buildInstagramBioLinkFromHandle(profileHandle);
  }, [profileHandle]);

  useEffect(() => {
    if (
      currentStep !== 'profile-ready' ||
      !profileId ||
      didTrackProfileReadyStepViewRef.current
    ) {
      return;
    }

    didTrackProfileReadyStepViewRef.current = true;
    void postDistributionEvent({
      eventType: 'step_viewed',
      metadata: { surface: 'onboarding' },
      platform: 'instagram',
      profileId,
    });
  }, [currentStep, profileId]);

  const handleCopyInstagramBioLink = useCallback(async () => {
    if (!instagramBioLink || !profileId) {
      return;
    }

    const didCopy = await copyToClipboard(instagramBioLink);
    if (!didCopy) {
      notifications.error('Failed to copy link');
      return;
    }

    setDidCopyInstagramBioLink(true);
    notifications.success('Instagram bio link copied', { duration: 2000 });
    void postDistributionEvent({
      eventType: 'link_copied',
      metadata: { surface: 'onboarding' },
      platform: 'instagram',
      profileId,
    });
  }, [instagramBioLink, notifications, profileId]);

  const handleOpenInstagram = useCallback(() => {
    if (!profileId) {
      return;
    }

    setDidOpenInstagram(true);
    void postDistributionEvent({
      eventType: 'platform_opened',
      metadata: { surface: 'onboarding' },
      platform: 'instagram',
      profileId,
    });
    globalThis.open(
      INSTAGRAM_EDIT_PROFILE_URL,
      '_blank',
      'noopener,noreferrer'
    );
  }, [profileId]);

  const handleOpenDashboard = useCallback(() => {
    if (profileId && !didCopyInstagramBioLink && !didOpenInstagram) {
      void postDistributionEvent({
        eventType: 'skipped',
        metadata: { surface: 'onboarding' },
        platform: 'instagram',
        profileId,
      });
    }

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

    const planIntent = getPlanIntent();
    const hasIntent = isPaidIntent(planIntent);
    const plan = hasIntent ? planIntent : DEFAULT_UPSELL_PLAN;
    const source = hasIntent ? 'intent' : 'organic';
    const chatUrl = `${APP_ROUTES.CHAT}?from=onboarding&panel=profile`;
    const nextUrl = `${APP_ROUTES.ONBOARDING_CHECKOUT}?plan=${plan}&source=${source}&returnTo=${encodeURIComponent(chatUrl)}`;

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
  }, [
    anythingElse,
    didCopyInstagramBioLink,
    didOpenInstagram,
    previewSnapshot,
    profileId,
    router,
  ]);

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
        className='absolute top-full right-0 left-0 z-10 mt-2 max-h-[320px] overflow-y-auto p-1'
      >
        {results.map(artist => {
          const unavailable = isReservedArtist(artist);
          const followerLabel = artist.followers
            ? `${artist.followers.toLocaleString()} followers`
            : 'Spotify';

          return (
            <li key={artist.id}>
              <button
                type='button'
                disabled={unavailable}
                onClick={() => {
                  connectArtist({
                    id: artist.id,
                    imageUrl: artist.imageUrl ?? null,
                    name: artist.name,
                    url: artist.url,
                  });
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors',
                  unavailable
                    ? 'cursor-default opacity-35'
                    : 'hover:bg-surface-0'
                )}
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
                  <p className='truncate text-sm font-semibold text-primary-token'>
                    {artist.name}
                  </p>
                  <p className='text-xs text-secondary-token'>
                    {unavailable ? 'Unavailable' : followerLabel}
                  </p>
                </div>

                {unavailable ? (
                  <Lock className='h-4 w-4 shrink-0 text-tertiary-token' />
                ) : (
                  <ArrowRight className='h-4 w-4 shrink-0 text-tertiary-token' />
                )}
              </button>
            </li>
          );
        })}

        <li className='flex items-center justify-between border-t border-subtle px-3 py-2'>
          <span className='text-xs text-tertiary-token'>Need help?</span>
          <a
            href='mailto:support@jov.ie'
            className='text-xs text-secondary-token transition-colors hover:text-primary-token'
          >
            Contact support
          </a>
        </li>
      </ContentSurfaceCard>
    );
  };

  function renderEarlyStep() {
    switch (currentStep) {
      case 'handle':
        return (
          <OnboardingHandleStep
            autoSubmitClaimed={autoSubmitClaimed}
            ctaDisabledReason={handleStepCtaDisabledReason}
            handleInput={profileHandle}
            handleValidation={handleValidation}
            inputRef={handleInputRef}
            isHydrated={isHydrated}
            isPendingSubmit={isPendingSubmit}
            isReservedHandle={isReservedHandle}
            isSubmitting={state.isSubmitting}
            isTransitioning={false}
            onHandleChange={setProfileHandle}
            onSubmit={handleSubmit}
            stateError={state.error}
            title='Claim your link'
            prompt='This is the only link you need to share your music. Make it yours.'
          />
        );

      case 'spotify':
        return (
          <StepFrame title='Are you on Spotify?'>
            {discoveryError ? (
              <InlineNotice>{discoveryError}</InlineNotice>
            ) : null}

            <div className='relative'>
              <div className='flex items-center gap-3 rounded-3xl border border-subtle bg-surface-1 px-4 py-3'>
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
          </StepFrame>
        );

      case 'artist-confirm': {
        const hasError =
          discoveryError ||
          getBlockingReason(discoverySnapshot) === 'spotify_import_failed';
        const isImporting =
          isArtistConnectPending ||
          isConnecting ||
          isEnriching ||
          isDiscoveryLoading;
        const artistConfirmTitle = hasError
          ? 'Import ran into an issue'
          : 'Spotify connected';
        const artistConfirmPrompt = hasError
          ? 'You can try connecting again or skip ahead.'
          : "We'll import your discography in the background. You can keep going.";
        const chooseArtistLabel = hasError
          ? 'Try again'
          : 'Choose a different artist';

        return (
          <StepFrame
            title={artistConfirmTitle}
            prompt={artistConfirmPrompt}
            actions={
              <>
                <Button
                  onClick={() => {
                    setDiscoveryError(null);
                    setCurrentStep('spotify');
                  }}
                  disabled={isImporting}
                  variant='secondary'
                >
                  {chooseArtistLabel}
                </Button>
                <Button
                  onClick={() => setCurrentStep('upgrade')}
                  disabled={isImporting}
                >
                  Continue
                  <ArrowRight className='ml-1 h-4 w-4' />
                </Button>
              </>
            }
          >
            {isImporting && !hasError ? (
              <div className='flex items-center gap-2 text-sm text-secondary-token'>
                <LoadingSpinner size='sm' className='text-tertiary-token' />
                <span>Importing…</span>
              </div>
            ) : null}
          </StepFrame>
        );
      }

      case 'upgrade':
        return (
          <StepFrame
            title='Want the full profile from day one?'
            prompt='Your import is ready. Continue with the free plan, or unlock the paid plan before you land in the dashboard.'
            actions={
              <>
                <Button
                  disabled={isReadinessPending(discoverySnapshot)}
                  onClick={advanceFromStep}
                  variant='secondary'
                >
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
              <p className='text-sm font-semibold text-primary-token'>
                Discovery is already complete for this onboarding pass.
              </p>
              <p className='mt-2 text-sm leading-6 text-secondary-token'>
                Checkout still returns directly to the onboarding flow, so this
                is a short detour rather than a separate setup.
              </p>
            </ContentSurfaceCard>
          </StepFrame>
        );

      default:
        return null;
    }
  }

  function renderLateStep() {
    switch (currentStep) {
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
              <InlineNotice>{discoveryError}</InlineNotice>
            ) : null}

            {discoverySnapshot?.dspItems.length ? (
              discoverySnapshot.dspItems.map(item => (
                <FlatPanel key={item.id}>
                  <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='min-w-0'>
                      <p className='text-2xs font-semibold text-tertiary-token'>
                        {item.providerLabel}
                      </p>
                      <p className='truncate text-base font-semibold text-primary-token'>
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
                </FlatPanel>
              ))
            ) : (
              <EmptyState
                title={
                  discoverySnapshot?.hasPendingDiscoveryJob
                    ? 'Still discovering DSPs'
                    : 'No additional DSP matches yet'
                }
                body='We did not find additional DSP matches in this onboarding pass.'
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
            {discoveryError ? (
              <InlineNotice>{discoveryError}</InlineNotice>
            ) : null}

            {(discoverySnapshot?.socialItems.length ?? 0) > 0 ? (
              discoverySnapshot?.socialItems.map(item => {
                const isPending =
                  item.kind === 'suggestion'
                    ? item.state === 'pending'
                    : item.state === 'suggested';

                return (
                  <FlatPanel key={`${item.kind}:${item.id}`}>
                    <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                      <div className='min-w-0'>
                        <p className='text-2xs font-semibold text-tertiary-token'>
                          {item.platformLabel}
                        </p>
                        <p className='truncate text-base font-semibold text-primary-token'>
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
                  </FlatPanel>
                );
              })
            ) : (
              <EmptyState
                title='No social suggestions yet'
                body='We did not find any social suggestions in this onboarding pass.'
              />
            )}
          </StepFrame>
        );

      case 'releases':
        return (
          <StepFrame
            title='Your release preview'
            prompt='This is what Jovie pulled in from your catalog.'
            actions={
              <>
                <Button onClick={() => refreshDiscovery()} variant='secondary'>
                  <RefreshCw className='mr-1 h-4 w-4' />
                  Refresh
                </Button>
                <Button
                  disabled={isReadinessPending(discoverySnapshot)}
                  onClick={advanceFromStep}
                >
                  Continue
                  <ArrowRight className='ml-1 h-4 w-4' />
                </Button>
              </>
            }
          >
            {discoverySnapshot?.releases.length ? (
              discoverySnapshot.releases.map(release => (
                <FlatPanel key={release.id}>
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
                      <p className='truncate text-base font-semibold text-primary-token'>
                        {release.title}
                      </p>
                      <p className='text-sm text-secondary-token'>
                        {release.releaseDate
                          ? new Date(release.releaseDate).toLocaleDateString()
                          : 'Release date pending'}
                      </p>
                    </div>
                  </div>
                </FlatPanel>
              ))
            ) : (
              <EmptyState
                title='Still importing releases'
                body={
                  getReadinessMessage(discoverySnapshot) ??
                  'This is taking longer than usual. Refresh to check again.'
                }
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
              <FlatPanel key={item.id}>
                <p className='text-2xs font-semibold text-tertiary-token'>
                  {item.subtitle}
                </p>
                <p className='mt-1 text-base font-semibold text-primary-token'>
                  {item.title}
                </p>
              </FlatPanel>
            ))}
          </StepFrame>
        );

      case 'profile-ready':
        return (
          <StepFrame
            title='Your Link Is Live'
            prompt='Put your Jovie link where fans already look. We will count activation when the first Instagram visitor lands on it.'
            actions={
              <>
                <Button onClick={handleCopyInstagramBioLink}>
                  Copy Instagram Bio Link
                </Button>
                <Button onClick={handleOpenInstagram} variant='secondary'>
                  Open Instagram
                </Button>
                <Button
                  disabled={!canProceedToDashboard(discoverySnapshot)}
                  onClick={handleOpenDashboard}
                  variant='ghost'
                >
                  Open dashboard
                  <ArrowRight className='ml-1 h-4 w-4' />
                </Button>
              </>
            }
          >
            <FlatPanel>
              <div className='space-y-4'>
                <div>
                  <p className='text-2xs font-semibold text-tertiary-token'>
                    Your public link
                  </p>
                  <p className='mt-1 text-base font-semibold text-primary-token'>
                    {publicProfileUrl ?? 'Your Jovie link will appear here'}
                  </p>
                  <p className='mt-2 text-sm leading-6 text-secondary-token'>
                    We copy a tagged Instagram bio link so your first visit gets
                    attributed even when referrers are weak.
                  </p>
                </div>
                <ol className='space-y-3'>
                  <li className='flex items-start gap-3'>
                    <span className='mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-2xs font-semibold text-primary-token'>
                      1
                    </span>
                    <div className='min-w-0'>
                      <p className='text-sm font-semibold text-primary-token'>
                        Copy your Instagram bio link
                      </p>
                      <p className='text-sm leading-6 text-secondary-token'>
                        {didCopyInstagramBioLink
                          ? 'Copied. Paste this version so Instagram traffic stays attributable.'
                          : 'Use the primary action above to copy the tagged version.'}
                      </p>
                    </div>
                  </li>
                  <li className='flex items-start gap-3'>
                    <span className='mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-2xs font-semibold text-primary-token'>
                      2
                    </span>
                    <div className='min-w-0'>
                      <p className='text-sm font-semibold text-primary-token'>
                        Open Instagram
                      </p>
                      <p className='text-sm leading-6 text-secondary-token'>
                        {didOpenInstagram
                          ? 'Instagram is open. Head to Edit Profile.'
                          : 'Open your profile settings and go to Edit Profile.'}
                      </p>
                    </div>
                  </li>
                  <li className='flex items-start gap-3'>
                    <span className='mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 text-2xs font-semibold text-primary-token'>
                      3
                    </span>
                    <div className='min-w-0'>
                      <p className='text-sm font-semibold text-primary-token'>
                        Paste it into your bio
                      </p>
                      <p className='text-sm leading-6 text-secondary-token'>
                        Put the copied link in the website field. Activation
                        happens on the first Instagram-sourced visit.
                      </p>
                    </div>
                  </li>
                </ol>
              </div>
            </FlatPanel>

            <FlatPanel className='border-b-0 pb-0'>
              <label
                className='text-sm font-semibold text-primary-token'
                htmlFor='onboarding-anything-else'
              >
                Anything else I should know?
              </label>
              <textarea
                id='onboarding-anything-else'
                className='mt-3 min-h-[120px] w-full border-b border-[color-mix(in_oklab,var(--linear-app-frame-seam)_72%,transparent)] bg-transparent px-0 py-3 text-sm text-primary-token outline-none placeholder:text-tertiary-token'
                onChange={event => setAnythingElse(event.target.value)}
                placeholder='Optional context for your first Jovie chat…'
                value={anythingElse}
              />
            </FlatPanel>
          </StepFrame>
        );

      default:
        return null;
    }
  }

  const stepContent = renderEarlyStep() ?? renderLateStep();

  return (
    <OnboardingExperienceShell
      mode='standalone'
      stableStageHeight={currentStep === 'handle' ? 'tall' : 'default'}
      sidebar={
        <OnboardingSidebar
          currentStep={currentStep}
          onBack={
            currentStep === 'spotify' ||
            currentStep === 'artist-confirm' ||
            currentStep === 'upgrade'
              ? handleGoBack
              : undefined
          }
        />
      }
      sidebarTitle='Jovie Setup'
      stageVariant='flat'
      visualVariant={designV1 ? 'v1' : 'default'}
      data-testid='onboarding-experience-shell'
    >
      {stepContent}
    </OnboardingExperienceShell>
  );
}
