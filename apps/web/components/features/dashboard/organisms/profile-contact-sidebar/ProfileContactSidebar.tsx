'use client';
import { Button } from '@jovie/ui';
import { Plus } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  type PreviewPanelData,
  type PreviewPanelLink,
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { toast } from '@/components/feedback';
import {
  DrawerTabbedCard,
  DrawerTabs,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { useProfileHeaderParts } from '@/components/organisms/profile-sidebar/ProfileSidebarHeader';
import { BASE_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { ProfilePaySurface } from '@/features/dashboard/molecules/ProfilePaySurface';
import { useEmailSignatureMenuAction } from '@/features/dashboard/molecules/useEmailSignatureMenuAction';
import { getPlatformCategory } from '@/features/dashboard/organisms/links/utils/platform-category';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { buildSignatureInputFromProfile } from '@/lib/email-signature/profile-input';
import {
  FetchError,
  fetchWithTimeout,
  type ProfileUpdateInput,
  useDeletePressPhotoMutation,
  useDspMatchesQuery,
  usePressPhotosQuery,
  usePressPhotoUploadMutation,
  useProfileMonetizationSummary,
  useProfileSaveMutation,
  useRemoveSocialLinkMutation,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { ProfileAboutTab } from './ProfileAboutTab';
import {
  ProfileBentoView,
  ProfileSidebarHeaderCard,
} from './ProfileContactSidebarSections';
import { type CategoryOption, ProfileLinkList } from './ProfileLinkList';
import { SidebarLinkInput } from './SidebarLinkInput';
import { SuggestedDspMatches } from './SuggestedDspMatches';

/** Map a platform's category to a sidebar tab, returning null if no switch is needed. */
function computeTargetCategory(
  platformId: string,
  currentCategory: CategoryOption
): CategoryOption | null {
  const raw = getPlatformCategory(platformId);
  const mapped: CategoryOption =
    raw === 'websites' || raw === 'custom' ? 'social' : (raw as CategoryOption);
  if (mapped === currentCategory) return null;
  if (mapped === 'social' || mapped === 'dsp' || mapped === 'earnings') {
    return mapped;
  }
  return null;
}

/** Base tab options for the profile sidebar categories */
const PROFILE_TAB_OPTIONS_BASE = [
  { value: 'social' as const, label: 'Social' },
  { value: 'dsp' as const, label: 'Music' },
  { value: 'earnings' as const, label: 'Earn' },
  { value: 'about' as const, label: 'About' },
] as const;

/** Build tab options with optional dot indicator on the Music tab */
function buildTabOptions(hasSuggestions: boolean) {
  if (!hasSuggestions) return PROFILE_TAB_OPTIONS_BASE;
  return PROFILE_TAB_OPTIONS_BASE.map(tab =>
    tab.value === 'dsp'
      ? {
          ...tab,
          label: (
            <span className='inline-flex items-center gap-1.5'>
              <span>Music</span>
              <span className='h-1.5 w-1.5 rounded-full bg-accent' />
            </span>
          ),
        }
      : tab
  );
}

const LINK_ACTION_CATEGORIES: ReadonlySet<CategoryOption> = new Set([
  'social',
  'dsp',
  'earnings',
]);

function resolveCategoryFromTab(
  tab: string | null
): CategoryOption | 'about' | null {
  switch (tab) {
    case 'social':
      return 'social';
    case 'music':
      return 'dsp';
    case 'earn':
      return 'earnings';
    case 'about':
      return 'about';
    default:
      return null;
  }
}

let tempLinkIdCounter = 0;

type EditableProfileField = 'bio' | 'location' | 'hometown' | 'genres';
type EditableProfileValue = PreviewPanelData[EditableProfileField];
type EditableProfileUpdate = Pick<
  ProfileUpdateInput['updates'],
  EditableProfileField
>;
type SaveProfileField = (
  field: EditableProfileField,
  previewValue: EditableProfileValue,
  updates: EditableProfileUpdate,
  errorMessage: string
) => void;
type FieldOperationState = 'pending' | 'succeeded' | 'failed';
interface FieldOperation {
  readonly generation: number;
  readonly previewValue: EditableProfileValue;
  state: FieldOperationState;
}
interface FieldOperationLedger {
  baseline: EditableProfileValue;
  readonly operations: Map<number, FieldOperation>;
}
interface QueuedFieldSave {
  readonly profileId: string;
  readonly field: EditableProfileField;
  readonly generation: number;
  readonly previewValue: EditableProfileValue;
  readonly updates: EditableProfileUpdate;
  readonly errorMessage: string;
  readonly epoch: number;
}

type ProfileRailMutationStatus =
  | { state: 'idle' | 'saving' | 'saved' }
  | { state: 'error'; message: string; retry: () => void };

const IDLE_MUTATION_STATUS: ProfileRailMutationStatus = { state: 'idle' };

function ProfileRailMutationStatusRow({
  status,
}: {
  readonly status: ProfileRailMutationStatus;
}) {
  return (
    <div
      data-testid='profile-rail-mutation-status'
      data-state={status.state}
      role='status'
      aria-live='polite'
      aria-atomic='true'
      className='flex h-7 shrink-0 items-center justify-end gap-1.5 overflow-hidden whitespace-nowrap text-2xs text-tertiary-token'
    >
      {status.state === 'saving' ? 'Saving…' : null}
      {status.state === 'saved' ? 'Saved' : null}
      {status.state === 'error' ? (
        <>
          <span>{status.message}</span>
          <Button
            type='button'
            variant='link'
            size='sm'
            className='h-auto min-h-0 px-0 py-0 text-2xs'
            onClick={status.retry}
          >
            Retry
          </Button>
        </>
      ) : null}
      {status.state === 'idle' ? (
        <span className='invisible' aria-hidden='true'>
          Saved
        </span>
      ) : null}
    </div>
  );
}

function createTempLinkId(): string {
  tempLinkIdCounter += 1;
  return `temp-${Date.now()}-${tempLinkIdCounter}`;
}

async function enqueuePlatformMutation<T>(
  queues: Map<string, Promise<unknown>>,
  platform: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = queues.get(platform) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  queues.set(platform, current);
  try {
    return await current;
  } finally {
    if (queues.get(platform) === current) queues.delete(platform);
  }
}

/** Persist a detected link to the server. Returns the server-assigned linkId. */
async function confirmLinkOnServer(
  profileId: string,
  link: DetectedLink,
  expectedVersion?: number
): Promise<{ linkId: string; version: number }> {
  return fetchWithTimeout<{ linkId: string; version: number }>(
    '/api/chat/confirm-link',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId,
        platform: link.platform.id,
        url: link.originalUrl,
        normalizedUrl: link.normalizedUrl,
        expectedVersion,
      }),
    }
  );
}

function getConflictVersion(error: unknown): number | undefined {
  if (!(error instanceof FetchError) || error.status !== 409) return undefined;
  const currentVersion = error.parsedBody?.currentVersion;
  return typeof currentVersion === 'number' && Number.isInteger(currentVersion)
    ? currentVersion
    : undefined;
}

/** Convert preview-panel links into the LegacySocialLink shape the public surface expects. */

/**
 * Read-only "show off your profile" view: the shared phone-preview bento with a
 * Live badge, a More dropdown (open / copy / UTM builder), live view/click stats
 * + copy URL, and an Edit profile button that flips the rail into edit mode.
 */
export function ProfileContactSidebar() {
  const { isOpen, close } = usePreviewPanelState();
  const { previewData, setPreviewData } = usePreviewPanelData();
  const { selectedProfile } = useDashboardData();

  // Rail mode: 'view' shows the phone-preview bento (default — "show off" /
  // "give me my link"); 'edit' shows the link-editing tabs. The Edit profile
  // button flips to edit; Done flips back.
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: monetizationSummary } = useProfileMonetizationSummary(
    Boolean(selectedProfile)
  );

  // Keep a ref to the latest previewData so async callbacks avoid stale closures
  const previewDataRef = useRef(previewData);
  previewDataRef.current = previewData;

  const mountedRef = useRef(true);
  const operationEpochRef = useRef(0);
  const fieldGenerationRef = useRef<Record<EditableProfileField, number>>({
    bio: 0,
    location: 0,
    hometown: 0,
    genres: 0,
  });
  const fieldOperationLedgersRef = useRef<
    Partial<Record<EditableProfileField, FieldOperationLedger>>
  >({});
  const queuedFieldSavesRef = useRef<
    Map<EditableProfileField, QueuedFieldSave>
  >(new Map());
  const profileSaveWorkerRunningRef = useRef(false);
  const selectedProfileIdRef = useRef(selectedProfile?.id);
  const profileVersionRef = useRef<number | undefined>(
    previewData?.profileEditVersion ?? selectedProfile?.profileEditVersion
  );
  const linkGenerationRef = useRef<Map<string, number>>(new Map());
  const linkVersionByPlatformRef = useRef<Map<string, number>>(new Map());
  const linkPlatformQueueRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const pendingOperationCountRef = useRef(0);
  const activeMutationErrorRef = useRef<Extract<
    ProfileRailMutationStatus,
    { state: 'error' }
  > | null>(null);
  const [mutationStatus, setMutationStatus] =
    useState<ProfileRailMutationStatus>(IDLE_MUTATION_STATUS);

  useEffect(() => {
    const queuedFieldSaves = queuedFieldSavesRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationEpochRef.current += 1;
      queuedFieldSaves.clear();
    };
  }, []);

  useEffect(() => {
    const nextProfileId = selectedProfile?.id;
    if (selectedProfileIdRef.current === nextProfileId) return;

    selectedProfileIdRef.current = nextProfileId;
    operationEpochRef.current += 1;
    profileVersionRef.current = selectedProfile?.profileEditVersion;
    queuedFieldSavesRef.current.clear();
    fieldOperationLedgersRef.current = {};
    fieldGenerationRef.current = {
      bio: 0,
      location: 0,
      hometown: 0,
      genres: 0,
    };
    linkGenerationRef.current.clear();
    linkVersionByPlatformRef.current.clear();
    linkPlatformQueueRef.current.clear();
    pendingOperationCountRef.current = 0;
    activeMutationErrorRef.current = null;
    setMutationStatus(IDLE_MUTATION_STATUS);
  }, [selectedProfile?.id, selectedProfile?.profileEditVersion]);

  useEffect(() => {
    profileVersionRef.current =
      previewData?.profileEditVersion ?? selectedProfile?.profileEditVersion;
  }, [previewData?.profileEditVersion, selectedProfile?.profileEditVersion]);

  useEffect(() => {
    linkVersionByPlatformRef.current.clear();
    for (const link of previewData?.links ?? []) {
      if (link.version !== undefined) {
        linkVersionByPlatformRef.current.set(link.platform, link.version);
      }
    }
  }, [previewData?.links]);

  const patchPreviewData = useCallback(
    (updater: (current: PreviewPanelData) => PreviewPanelData) => {
      const current = previewDataRef.current;
      if (!current) return null;
      const next = updater(current);
      previewDataRef.current = next;
      setPreviewData(next);
      return next;
    },
    [setPreviewData]
  );

  const beginMutationStatus = useCallback(() => {
    pendingOperationCountRef.current += 1;
    activeMutationErrorRef.current = null;
    if (mountedRef.current) setMutationStatus({ state: 'saving' });
  }, []);

  const completeMutationSuccess = useCallback(() => {
    pendingOperationCountRef.current = Math.max(
      0,
      pendingOperationCountRef.current - 1
    );
    if (!mountedRef.current) return;
    if (activeMutationErrorRef.current) {
      setMutationStatus(activeMutationErrorRef.current);
      return;
    }
    setMutationStatus({
      state: pendingOperationCountRef.current > 0 ? 'saving' : 'saved',
    });
  }, []);

  const completeMutationError = useCallback(
    (message: string, retry: () => void) => {
      pendingOperationCountRef.current = Math.max(
        0,
        pendingOperationCountRef.current - 1
      );
      if (!mountedRef.current) return;
      const errorStatus = { state: 'error', message, retry } as const;
      activeMutationErrorRef.current = errorStatus;
      setMutationStatus(errorStatus);
    },
    []
  );

  const reconcileFieldOperations = useCallback(
    (field: EditableProfileField) => {
      const ledger = fieldOperationLedgersRef.current[field];
      if (!ledger) return;

      const operations = [...ledger.operations.values()].sort(
        (left, right) => right.generation - left.generation
      );
      const visibleOperation = operations.find(
        operation => operation.state !== 'failed'
      );
      const visibleValue = visibleOperation?.previewValue ?? ledger.baseline;
      patchPreviewData(data => ({ ...data, [field]: visibleValue }));

      if (!operations.some(operation => operation.state === 'pending')) {
        ledger.baseline = visibleValue;
        ledger.operations.clear();
      }
    },
    [patchPreviewData]
  );

  // Tab state
  const [selectedCategory, setSelectedCategory] = useState<
    CategoryOption | 'about'
  >('social');
  const selectedCategoryRef = useRef<CategoryOption | 'about'>('social');
  selectedCategoryRef.current = selectedCategory;

  // Suggested DSP matches — used for dot indicator on Music tab
  const { data: suggestedMatches } = useDspMatchesQuery({
    profileId: selectedProfile?.id ?? '',
    status: 'suggested',
    enabled: !!selectedProfile?.id,
  });
  const hasSuggestions = (suggestedMatches?.length ?? 0) > 0;
  const tabOptions = useMemo(
    () => buildTabOptions(hasSuggestions),
    [hasSuggestions]
  );

  // Mutations for profile editing
  const profileMutation = useProfileSaveMutation();
  const pressPhotoUploadMutation = usePressPhotoUploadMutation(
    selectedProfile?.id
  );
  const deletePressPhotoMutation = useDeletePressPhotoMutation(
    selectedProfile?.id
  );
  const removeLinkMutation = useRemoveSocialLinkMutation();
  const { data: pressPhotos = [] } = usePressPhotosQuery(
    selectedProfile?.id ?? ''
  );

  // Add link state
  const [isAddingLink, setIsAddingLink] = useState(false);
  const isAddingLinkRef = useRef(false);
  isAddingLinkRef.current = isAddingLink;

  // Track temp link IDs with pending server adds. If user deletes a temp link
  // while its confirm-link request is in flight, we queue a server delete for
  // after the add completes to avoid orphaned server records.
  const pendingAddsRef = useRef<Set<string>>(new Set());
  const deletedWhilePendingRef = useRef<Set<string>>(new Set());

  const saveProfileFieldRef = useRef<SaveProfileField>(() => {});
  const removeLinkRef = useRef<(linkId: string) => void>(() => {});
  const addLinkRef = useRef<(link: DetectedLink) => void>(() => {});

  // Resolve category to ensure it's a valid tab value
  const resolvedCategory = useMemo(() => {
    if (PROFILE_TAB_OPTIONS_BASE.some(tab => tab.value === selectedCategory)) {
      return selectedCategory;
    }
    return 'social' as const;
  }, [selectedCategory]);

  // Sync state when resolved category differs (e.g., after data load)
  useEffect(() => {
    if (resolvedCategory !== selectedCategory) {
      setSelectedCategory(resolvedCategory);
    }
  }, [resolvedCategory, selectedCategory]);

  useEffect(() => {
    const requestedCategory = resolveCategoryFromTab(searchParams.get('tab'));
    if (
      requestedCategory &&
      requestedCategory !== selectedCategoryRef.current
    ) {
      setSelectedCategory(requestedCategory);
    }

    if (
      requestedCategory === 'earnings' &&
      searchParams.get('addLink') === '1' &&
      !isAddingLinkRef.current
    ) {
      setIsAddingLink(true);
    }
  }, [searchParams]);

  const supportsAddAction = LINK_ACTION_CATEGORIES.has(
    resolvedCategory as CategoryOption
  );

  const handlePressPhotoUpload = useCallback(
    async (file: File) => {
      const uploadedPhoto = await pressPhotoUploadMutation.mutateAsync(file);
      toast.success('Press photo uploaded');
      return uploadedPhoto;
    },
    [pressPhotoUploadMutation]
  );

  const handlePressPhotoDelete = useCallback(
    async (photoId: string) => {
      await deletePressPhotoMutation.mutateAsync(photoId);
      toast.success('Press photo deleted');
    },
    [deletePressPhotoMutation]
  );

  const drainProfileSaveQueue = useCallback(async () => {
    if (profileSaveWorkerRunningRef.current) return;
    profileSaveWorkerRunningRef.current = true;

    try {
      while (queuedFieldSavesRef.current.size > 0) {
        const nextEntry = queuedFieldSavesRef.current.entries().next().value;
        if (!nextEntry) break;
        const [field, queuedSave] = nextEntry;
        queuedFieldSavesRef.current.delete(field);

        try {
          const result = await profileMutation.mutateAsync({
            profileId: queuedSave.profileId,
            expectedVersion: profileVersionRef.current,
            updates: queuedSave.updates,
          });

          const operation = fieldOperationLedgersRef.current[
            field
          ]?.operations.get(queuedSave.generation);
          if (
            mountedRef.current &&
            operationEpochRef.current === queuedSave.epoch &&
            operation
          ) {
            profileVersionRef.current = result.profile.profileEditVersion;
            operation.state = 'succeeded';
            patchPreviewData(data => ({
              ...data,
              profileEditVersion: result.profile.profileEditVersion,
            }));
            reconcileFieldOperations(field);
            completeMutationSuccess();
          }
        } catch (error) {
          const conflictVersion = getConflictVersion(error);
          const operation = fieldOperationLedgersRef.current[
            field
          ]?.operations.get(queuedSave.generation);
          const canReconcile =
            mountedRef.current &&
            operationEpochRef.current === queuedSave.epoch &&
            operation;
          if (!canReconcile) {
            continue;
          }
          if (conflictVersion !== undefined) {
            profileVersionRef.current = conflictVersion;
          }

          operation.state = 'failed';
          reconcileFieldOperations(field);
          const isLatestIntent =
            fieldGenerationRef.current[field] === queuedSave.generation;
          if (!isLatestIntent) {
            completeMutationSuccess();
            continue;
          }

          const retry = () =>
            saveProfileFieldRef.current(
              field,
              queuedSave.previewValue,
              queuedSave.updates,
              queuedSave.errorMessage
            );
          completeMutationError(queuedSave.errorMessage, retry);
          toast.error(queuedSave.errorMessage);
        }
      }
    } finally {
      profileSaveWorkerRunningRef.current = false;
      if (queuedFieldSavesRef.current.size > 0) {
        void drainProfileSaveQueue();
      }
    }
  }, [
    completeMutationError,
    completeMutationSuccess,
    patchPreviewData,
    profileMutation,
    reconcileFieldOperations,
  ]);

  const saveProfileField = useCallback<SaveProfileField>(
    (field, previewValue, updates, errorMessage) => {
      if (!selectedProfile) return;
      const current = previewDataRef.current;
      if (!current) return;

      const generation = fieldGenerationRef.current[field] + 1;
      fieldGenerationRef.current[field] = generation;
      const epoch = operationEpochRef.current;
      let ledger = fieldOperationLedgersRef.current[field];
      if (!ledger || ledger.operations.size === 0) {
        ledger = { baseline: current[field], operations: new Map() };
        fieldOperationLedgersRef.current[field] = ledger;
      }
      ledger.operations.set(generation, {
        generation,
        previewValue,
        state: 'pending',
      });

      const superseded = queuedFieldSavesRef.current.get(field);
      if (superseded) {
        const supersededOperation = ledger.operations.get(
          superseded.generation
        );
        if (supersededOperation) supersededOperation.state = 'failed';
        completeMutationSuccess();
      }

      queuedFieldSavesRef.current.set(field, {
        profileId: selectedProfile.id,
        field,
        generation,
        previewValue,
        updates,
        errorMessage,
        epoch,
      });
      patchPreviewData(data => ({ ...data, [field]: previewValue }));
      beginMutationStatus();
      void drainProfileSaveQueue();
    },
    [
      beginMutationStatus,
      completeMutationSuccess,
      drainProfileSaveQueue,
      patchPreviewData,
      selectedProfile,
    ]
  );
  saveProfileFieldRef.current = saveProfileField;

  // Handle bio change — save to server and instantly update sidebar
  const handleBioChange = useCallback(
    (value: string) => {
      saveProfileField(
        'bio',
        value || null,
        { bio: value },
        'Failed to update bio'
      );
    },
    [saveProfileField]
  );

  // Handle location change — save to server and instantly update sidebar
  const handleLocationChange = useCallback(
    (value: string | null) => {
      saveProfileField(
        'location',
        value,
        { location: value },
        'Failed to update location'
      );
    },
    [saveProfileField]
  );

  // Handle hometown change — save to server and instantly update sidebar
  const handleHometownChange = useCallback(
    (value: string | null) => {
      saveProfileField(
        'hometown',
        value,
        { hometown: value },
        'Failed to update hometown'
      );
    },
    [saveProfileField]
  );

  // Handle genres change — save to server and instantly update sidebar
  const handleGenresChange = useCallback(
    (value: string[]) => {
      saveProfileField(
        'genres',
        value,
        { genres: value },
        'Failed to update genres'
      );
    },
    [saveProfileField]
  );

  // Existing platform IDs for filtering suggestions
  const existingPlatformIds = useMemo(
    () =>
      previewData?.links
        .filter(l => l.platform !== 'youtube')
        .map(l => l.platform) ?? [],
    [previewData?.links]
  );

  // Reconcile optimistic ID with server ID, or clean up if user deleted while pending
  const reconcileAfterPersist = useCallback(
    (
      linkId: string,
      version: number,
      optimisticId: string,
      platformName: string,
      profileId: string
    ) => {
      if (deletedWhilePendingRef.current.has(optimisticId)) {
        deletedWhilePendingRef.current.delete(optimisticId);
        if (linkId) {
          void removeLinkMutation
            .mutateAsync({ profileId, linkId, expectedVersion: version })
            .catch(() => undefined);
        }
        return;
      }
      if (linkId) {
        const current = previewDataRef.current;
        if (current) {
          patchPreviewData(data => ({
            ...data,
            links: data.links
              .filter(l => l.id !== linkId || l.id === optimisticId)
              .map(l =>
                l.id === optimisticId ? { ...l, id: linkId, version } : l
              ),
          }));
        }
      }
      if (mountedRef.current) toast.success(`${platformName} link added`);
    },
    [patchPreviewData, removeLinkMutation]
  );

  // Revert optimistic add on failure
  const revertOptimisticAdd = useCallback(
    (optimisticId: string) => {
      if (deletedWhilePendingRef.current.has(optimisticId)) {
        deletedWhilePendingRef.current.delete(optimisticId);
        return false;
      }
      const current = previewDataRef.current;
      if (current) {
        patchPreviewData(data => ({
          ...data,
          links: data.links.filter(l => l.id !== optimisticId),
        }));
      }
      if (mountedRef.current) toast.error('Failed to add link');
      return true;
    },
    [patchPreviewData]
  );

  // Handle adding a new link (opens smart input)
  const handleAddLink = useCallback((_category?: string) => {
    setIsAddingLink(true);
  }, []);

  const handleSetUsername = useCallback(() => {
    if (pathname === APP_ROUTES.SETTINGS_ARTIST_PROFILE) {
      const usernameInput = document.getElementById('username');
      if (usernameInput instanceof HTMLInputElement) {
        usernameInput.focus();
        usernameInput.select();
        usernameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    router.push(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}#username`);
  }, [pathname, router]);

  const handleSetUpTips = useCallback(() => {
    if (monetizationSummary?.manageHref === APP_ROUTES.SETTINGS_PAYMENTS) {
      router.push(monetizationSummary.manageHref);
      return;
    }

    setSelectedCategory('earnings');
    setIsAddingLink(true);

    if (pathname === APP_ROUTES.SETTINGS_ARTIST_PROFILE) {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set('tab', 'earn');
      nextParams.set('addLink', '1');
      const nextSearch = nextParams.toString();
      const searchSuffix = nextSearch ? `?${nextSearch}` : '';
      router.replace(`${pathname}${searchSuffix}#pay`, {
        scroll: false,
      });
    }
  }, [monetizationSummary, pathname, router, searchParams]);

  const handleManagePayments = useCallback(() => {
    if (!monetizationSummary) return;
    router.push(monetizationSummary.manageHref);
  }, [monetizationSummary, router]);

  const handleViewAnalytics = useCallback(() => {
    router.push(APP_ROUTES.AUDIENCE);
  }, [router]);

  // Handle smart add — receives a detected link from SidebarLinkInput
  const handleSmartAddLink = useCallback(
    async (link: DetectedLink) => {
      if (!selectedProfile) return;
      const current = previewDataRef.current;
      if (!current) return;

      // Prevent duplicate platforms (except YouTube which can have multiple channels)
      if (link.platform.id !== 'youtube') {
        const existingLink = current.links.find(
          l => l.platform === link.platform.id
        );
        if (existingLink) {
          toast.error(`${link.platform.name} link already exists`);
          setIsAddingLink(false);
          return;
        }
      }

      linkGenerationRef.current.set(
        link.platform.id,
        (linkGenerationRef.current.get(link.platform.id) ?? 0) + 1
      );

      // Optimistically add to sidebar
      const optimisticLink: PreviewPanelLink = {
        id: createTempLinkId(),
        title: link.suggestedTitle ?? link.platform.name,
        url: link.normalizedUrl,
        platform: link.platform.id,
        isVisible: true,
      };

      patchPreviewData(data => ({
        ...data,
        links: [...data.links, optimisticLink],
      }));

      setIsAddingLink(false);

      // Auto-switch to the correct tab for the new link
      const targetCategory = computeTargetCategory(
        link.platform.id,
        resolvedCategory as CategoryOption
      );
      if (targetCategory) setSelectedCategory(targetCategory);

      // Save to server via confirm-link endpoint
      pendingAddsRef.current.add(optimisticLink.id);
      const epoch = operationEpochRef.current;
      beginMutationStatus();
      try {
        const { linkId, version } = await enqueuePlatformMutation(
          linkPlatformQueueRef.current,
          link.platform.id,
          () =>
            confirmLinkOnServer(
              selectedProfile.id,
              link,
              linkVersionByPlatformRef.current.get(link.platform.id)
            )
        );
        linkVersionByPlatformRef.current.set(link.platform.id, version);
        if (operationEpochRef.current === epoch) {
          reconcileAfterPersist(
            linkId,
            version,
            optimisticLink.id,
            link.platform.name,
            selectedProfile.id
          );
        } else if (deletedWhilePendingRef.current.has(optimisticLink.id)) {
          deletedWhilePendingRef.current.delete(optimisticLink.id);
          void removeLinkMutation
            .mutateAsync({
              profileId: selectedProfile.id,
              linkId,
              expectedVersion: version,
            })
            .catch(() => undefined);
        }
        completeMutationSuccess();
      } catch (error) {
        const conflictVersion = getConflictVersion(error);
        if (conflictVersion !== undefined) {
          linkVersionByPlatformRef.current.set(
            link.platform.id,
            conflictVersion
          );
        }
        if (mountedRef.current && operationEpochRef.current === epoch) {
          const reverted = revertOptimisticAdd(optimisticLink.id);
          if (reverted) {
            completeMutationError('Failed to add link', () =>
              addLinkRef.current(link)
            );
          } else {
            completeMutationSuccess();
          }
        } else {
          completeMutationSuccess();
        }
      } finally {
        pendingAddsRef.current.delete(optimisticLink.id);
      }
    },
    [
      selectedProfile,
      resolvedCategory,
      reconcileAfterPersist,
      revertOptimisticAdd,
      removeLinkMutation,
      patchPreviewData,
      beginMutationStatus,
      completeMutationError,
      completeMutationSuccess,
    ]
  );
  addLinkRef.current = link => {
    void handleSmartAddLink(link);
  };

  // Handle removing a link
  const handleRemoveLink = useCallback(
    (linkId: string) => {
      if (!selectedProfile) return;
      const current = previewDataRef.current;
      if (!current) return;

      const removedIndex = current.links.findIndex(l => l.id === linkId);
      const removedLink = current.links[removedIndex];
      if (!removedLink) return;

      // Optimistically remove from sidebar
      patchPreviewData(data => ({
        ...data,
        links: data.links.filter(l => l.id !== linkId),
      }));

      // If the add is still in flight, mark for server delete after it completes
      if (linkId.startsWith('temp-') && pendingAddsRef.current.has(linkId)) {
        deletedWhilePendingRef.current.add(linkId);
        toast.success('Link removed');
        return;
      }

      // Remaining temp-* IDs were never persisted (add failed or ID was
      // already replaced with a real one). No server call needed.
      if (linkId.startsWith('temp-')) {
        toast.success('Link removed');
        return;
      }

      const generation =
        (linkGenerationRef.current.get(removedLink.platform) ?? 0) + 1;
      linkGenerationRef.current.set(removedLink.platform, generation);
      const epoch = operationEpochRef.current;
      beginMutationStatus();

      void enqueuePlatformMutation(
        linkPlatformQueueRef.current,
        removedLink.platform,
        () =>
          removeLinkMutation.mutateAsync({
            profileId: selectedProfile.id,
            linkId,
            expectedVersion: removedLink.version ?? 1,
          })
      ).then(
        result => {
          linkVersionByPlatformRef.current.set(
            removedLink.platform,
            result.version ?? (removedLink.version ?? 1) + 1
          );
          const isCurrent =
            mountedRef.current &&
            operationEpochRef.current === epoch &&
            linkGenerationRef.current.get(removedLink.platform) === generation;
          completeMutationSuccess();
          if (isCurrent) toast.success('Link removed');
        },
        error => {
          const conflictVersion = getConflictVersion(error);
          const restoredLink =
            conflictVersion === undefined
              ? removedLink
              : { ...removedLink, version: conflictVersion };
          if (conflictVersion !== undefined) {
            linkVersionByPlatformRef.current.set(
              removedLink.platform,
              conflictVersion
            );
          }
          const isCurrent =
            mountedRef.current &&
            operationEpochRef.current === epoch &&
            linkGenerationRef.current.get(removedLink.platform) === generation;
          if (!isCurrent) {
            patchPreviewData(data => {
              if (data.links.some(link => link.id === restoredLink.id)) {
                return data;
              }
              const links = [...data.links];
              links.splice(
                Math.min(removedIndex, links.length),
                0,
                restoredLink
              );
              return { ...data, links };
            });
            completeMutationSuccess();
            return;
          }

          patchPreviewData(data => {
            if (data.links.some(link => link.id === restoredLink.id)) {
              return data;
            }
            const links = [...data.links];
            links.splice(Math.min(removedIndex, links.length), 0, restoredLink);
            return { ...data, links };
          });
          completeMutationError('Failed to remove link', () =>
            removeLinkRef.current(linkId)
          );
          toast.error('Failed to remove link');
        }
      );
    },
    [
      beginMutationStatus,
      completeMutationError,
      completeMutationSuccess,
      patchPreviewData,
      removeLinkMutation,
      selectedProfile,
    ]
  );
  removeLinkRef.current = handleRemoveLink;

  // Header parts hook needs to be called unconditionally
  const { overflowActions: baseOverflowActions } = useProfileHeaderParts({
    username: previewData?.username ?? '',
    displayName: previewData?.displayName ?? '',
    profilePath: previewData?.profilePath ?? '',
    onClose: close,
  });

  const emailSignatureInput = useMemo(
    () =>
      previewData?.username
        ? buildSignatureInputFromProfile({
            profile: {
              username: previewData.username,
              displayName: previewData.displayName,
              avatarUrl: previewData.avatarUrl,
              genres: previewData.genres,
              location: previewData.location,
            },
            socials: previewData.links.map(link => ({
              label: link.title,
              url: link.url,
            })),
          })
        : null,
    [previewData]
  );
  const { action: emailSignatureAction, modal: emailSignatureModal } =
    useEmailSignatureMenuAction(emailSignatureInput);
  const overflowActions = useMemo(
    () => [...baseOverflowActions, emailSignatureAction],
    [baseOverflowActions, emailSignatureAction]
  );

  // Show skeleton sidebar until preview data loads (prevents CLS)
  if (!previewData) {
    return (
      <EntitySidebarShell
        isOpen={isOpen}
        ariaLabel='Profile Contact'
        data-testid='profile-contact-sidebar'
        headerMode='minimal'
        hideMinimalHeaderBar
        contentBleed
      >
        {emailSignatureModal}
        <div className='space-y-2.5 px-1.5 pb-1.5 pt-2 lg:px-0 lg:pb-0 lg:pt-0.5'>
          <div className='space-y-2.5 p-3'>
            <div className='grid grid-cols-2 gap-3'>
              <div className='space-y-1'>
                <div className='h-2 w-12 rounded skeleton' />
                <div className='h-4 w-8 rounded skeleton' />
              </div>
              <div className='space-y-1'>
                <div className='h-2 w-12 rounded skeleton' />
                <div className='h-4 w-8 rounded skeleton' />
              </div>
            </div>
            <div className='h-8 rounded-full skeleton' />
          </div>
          <div className='flex items-center gap-1'>
            <div className='h-7 w-14 rounded-full skeleton' />
            <div className='h-7 w-14 rounded-full skeleton' />
            <div className='h-7 w-12 rounded-full skeleton' />
            <div className='h-7 w-14 rounded-full skeleton' />
          </div>
          <div className={cn(LINEAR_SURFACE.drawerCardSm, 'space-y-2 p-2')}>
            {[1, 2, 3, 4, 5].map(i => (
              <div
                key={i}
                className='flex items-center gap-3 rounded-lg border border-subtle bg-surface-0 px-2.5 py-2'
              >
                <div className='h-8 w-8 shrink-0 rounded-lg skeleton' />
                <div className='flex-1 h-4 rounded skeleton' />
              </div>
            ))}
          </div>
        </div>
      </EntitySidebarShell>
    );
  }

  const {
    bio,
    genres,
    location,
    hometown,
    activeSinceYear,
    links,
    profilePath,
    dspConnections,
  } = previewData;

  const profileUrl = `${BASE_URL}${profilePath}`;

  const profileSettingsRaw =
    (selectedProfile?.settings as Record<string, unknown> | null) ?? {};
  const allowPhotoDownloads =
    profileSettingsRaw.allowProfilePhotoDownloads === true;
  const showOldReleases = profileSettingsRaw.showOldReleases === true;

  if (mode === 'view') {
    return (
      <EntitySidebarShell
        isOpen={isOpen}
        ariaLabel='Profile Preview'
        data-testid='profile-contact-sidebar'
        headerMode='minimal'
        hideMinimalHeaderBar
        contentBleed
      >
        {emailSignatureModal}
        <ProfileBentoView
          previewData={previewData}
          profileUrl={profileUrl}
          onClose={close}
          onEditProfile={() => setMode('edit')}
        />
      </EntitySidebarShell>
    );
  }

  return (
    <EntitySidebarShell
      isOpen={isOpen}
      ariaLabel='Profile Contact'
      data-testid='profile-contact-sidebar'
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      entityHeader={
        <ProfileSidebarHeaderCard
          previewData={previewData}
          profileUrl={profileUrl}
          onClose={close}
          onDone={() => setMode('view')}
          overflowActions={overflowActions}
        />
      }
    >
      {emailSignatureModal}
      <DrawerTabbedCard
        testId='profile-contact-tabbed-card'
        className='mt-2.5'
        tabs={
          <DrawerTabs
            value={resolvedCategory}
            onValueChange={value =>
              setSelectedCategory(value as CategoryOption | 'about')
            }
            options={tabOptions}
            ariaLabel='Profile sidebar view'
            actions={
              supportsAddAction ? (
                <AppIconButton
                  type='button'
                  onClick={() => handleAddLink(resolvedCategory)}
                  className='h-7 w-7 rounded-full border-0 bg-transparent text-tertiary-token shadow-none hover:bg-surface-0 hover:text-primary-token'
                  ariaLabel={`Add ${PROFILE_TAB_OPTIONS_BASE.find(t => t.value === resolvedCategory)?.label ?? ''} link`}
                >
                  <Plus className='h-3.5 w-3.5' />
                </AppIconButton>
              ) : undefined
            }
            actionsClassName='h-7 w-7'
            overflowMode='scroll'
            distribution='fill'
          />
        }
        contentClassName='pt-2'
      >
        <ProfileRailMutationStatusRow status={mutationStatus} />
        {resolvedCategory === 'about' ? (
          <ProfileAboutTab
            bio={bio}
            genres={genres}
            location={location}
            hometown={hometown}
            activeSinceYear={activeSinceYear}
            allowPhotoDownloads={allowPhotoDownloads}
            showOldReleases={showOldReleases}
            pressPhotos={pressPhotos}
            onBioChange={handleBioChange}
            onLocationChange={handleLocationChange}
            onHometownChange={handleHometownChange}
            onGenresChange={handleGenresChange}
            onPressPhotoUpload={handlePressPhotoUpload}
            onPressPhotoDelete={handlePressPhotoDelete}
          />
        ) : (
          <>
            {resolvedCategory === 'earnings' && monetizationSummary ? (
              <div className='mb-2.5'>
                <ProfilePaySurface
                  summary={monetizationSummary}
                  variant='drawer'
                  onSetUsername={handleSetUsername}
                  onSetUpTips={handleSetUpTips}
                  onManagePayments={handleManagePayments}
                  onViewAnalytics={handleViewAnalytics}
                />
              </div>
            ) : null}
            <ProfileLinkList
              links={links}
              selectedCategory={resolvedCategory as CategoryOption}
              onAddLink={handleAddLink}
              onRemoveLink={handleRemoveLink}
              dspConnections={dspConnections}
              profileId={selectedProfile?.id}
              surface='plain'
            />

            {isAddingLink && (
              <div className='mt-2.5'>
                <SidebarLinkInput
                  categoryFilter={
                    resolvedCategory === 'social' ||
                    resolvedCategory === 'dsp' ||
                    resolvedCategory === 'earnings'
                      ? resolvedCategory
                      : 'social'
                  }
                  existingPlatforms={existingPlatformIds}
                  onAdd={handleSmartAddLink}
                  onCancel={() => setIsAddingLink(false)}
                  creatorName={previewData.displayName}
                />
              </div>
            )}

            {resolvedCategory === 'dsp' && selectedProfile?.id ? (
              <SuggestedDspMatches profileId={selectedProfile.id} />
            ) : null}
          </>
        )}
      </DrawerTabbedCard>
    </EntitySidebarShell>
  );
}
