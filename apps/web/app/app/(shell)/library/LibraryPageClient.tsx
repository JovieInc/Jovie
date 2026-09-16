'use client';

import { Button, ConfirmDialog } from '@jovie/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { toast } from '@/components/feedback';
import { APP_ROUTES } from '@/constants/routes';
import type { CreatorDocumentListItem } from '@/lib/creator-documents/types';
import type { ReleaseViewModel } from '@/lib/discography/types';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import {
  LIBRARY_LIFECYCLE_STAGES,
  LIBRARY_STAGE_LABELS,
  parseLibraryStageParam,
} from '@/lib/library/lifecycle-stage';
import {
  EMPTY_LIBRARY_POST_RELEASE_BUNDLE,
  type LibraryPostReleaseBundle,
} from '@/lib/library/post-release-types';
import type { LibraryProfileVisibility } from '@/lib/library/profile-visibility';
import type { LibraryRelationshipView } from '@/lib/library/track-drawer-types';
import type { LibraryMerchCard } from '@/lib/merch/types';
import type { PublicVideoListItem } from '@/lib/youtube-library/queries';
import { ReleaseCatalogPageClient } from '../dashboard/releases/ReleaseCatalogPageClient';
import { CreatorDocumentsWorkspace } from './CreatorDocumentsWorkspace';

const STAGE_TABS = ['all', ...LIBRARY_LIFECYCLE_STAGES] as const;

export function LibraryPageClient({
  creatorProfileId,
  merchCards,
  archivedMerchCards = [],
  archivedReleases = [],
  approvalStatusByAssetId = {},
  profileVisibilityByAssetId = {},
  assetShareByAssetId = {},
  creatorDocuments = [],
  creatorDocumentsNextCursor = null,
  creatorDocumentsLoadFailed = false,
  youtubeVideos = [],
  youtubeConnected = false,
  relationships = [],
  postReleaseBundle = EMPTY_LIBRARY_POST_RELEASE_BUNDLE,
}: {
  readonly creatorProfileId: string;
  readonly merchCards: readonly LibraryMerchCard[];
  readonly archivedMerchCards?: readonly LibraryMerchCard[];
  readonly archivedReleases?: readonly ReleaseViewModel[];
  readonly approvalStatusByAssetId?: Readonly<Record<string, string>>;
  readonly profileVisibilityByAssetId?: Readonly<
    Record<string, LibraryProfileVisibility>
  >;
  readonly assetShareByAssetId?: Readonly<
    Record<string, LibraryAssetShareViewModel>
  >;
  readonly creatorDocuments?: readonly CreatorDocumentListItem[];
  readonly creatorDocumentsNextCursor?: string | null;
  readonly creatorDocumentsLoadFailed?: boolean;
  readonly youtubeVideos?: readonly PublicVideoListItem[];
  readonly youtubeConnected?: boolean;
  readonly relationships?: readonly LibraryRelationshipView[];
  readonly postReleaseBundle?: LibraryPostReleaseBundle;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hasUnsavedDocumentDraft, setHasUnsavedDocumentDraft] = useState(false);
  const [pendingMode, setPendingMode] = useState<
    (typeof STAGE_TABS)[number] | null
  >(null);
  const [isImportingYouTube, startYouTubeImport] = useTransition();
  const discardDocumentDraftsRef = useRef<(() => void) | null>(null);
  const stage = parseLibraryStageParam(
    searchParams.get('stage') ?? searchParams.get('section')
  );
  const documentId = searchParams.get('document');
  const applyMode = (nextMode: (typeof STAGE_TABS)[number]) => {
    if (documentId && hasUnsavedDocumentDraft) {
      discardDocumentDraftsRef.current?.();
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete('section');
    next.delete('document');
    if (nextMode === 'all') next.delete('stage');
    else next.set('stage', nextMode);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };
  const setMode = (nextMode: (typeof STAGE_TABS)[number]) => {
    if (documentId && hasUnsavedDocumentDraft) {
      setPendingMode(nextMode);
      return;
    }
    applyMode(nextMode);
  };
  const rulesDeepLink = searchParams.get('rules');
  useEffect(() => {
    if (rulesDeepLink !== '1') return;
    router.replace(`${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?rules=1`);
  }, [router, rulesDeepLink]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const tabs = Array.from(
      event.currentTarget
        .closest('[role="tablist"]')
        ?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
    );
    const currentIndex = tabs.indexOf(event.currentTarget);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : event.key === 'ArrowRight'
            ? (currentIndex + 1) % tabs.length
            : event.key === 'ArrowLeft'
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : -1;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    event.preventDefault();
    nextTab.focus();
    nextTab.click();
  };

  const handleYouTubeImport = () => {
    if (!youtubeConnected) {
      const returnTo =
        stage === 'all' ? pathname : `${pathname}?stage=${stage}`;
      router.push(
        `/api/connectors/youtube/authorize?creatorProfileId=${encodeURIComponent(creatorProfileId)}&returnTo=${encodeURIComponent(returnTo)}`
      );
      return;
    }

    startYouTubeImport(async () => {
      try {
        const postPage = () =>
          fetch('/api/youtube-library/sync', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ creatorProfileId, mode: 'page' }),
          });
        let response = await postPage();
        let result = (await response.json()) as {
          state?: string;
          resumable?: boolean;
          counts?: { imported?: number; discovered?: number; skipped?: number };
          error?: string;
          lastErrorUserMessage?: string;
        };
        if (!response.ok) throw new Error(result.error ?? 'Import failed');
        while (result.resumable && result.state === 'partial') {
          response = await postPage();
          result = (await response.json()) as typeof result;
          if (!response.ok) throw new Error(result.error ?? 'Import failed');
        }
        const imported = result.counts?.imported ?? 0;
        const discovered = result.counts?.discovered ?? 0;
        if (result.state === 'quota-limited') {
          toast.error(
            `YouTube quota limited after ${imported} of ${discovered} videos. Resume import later.`
          );
        } else if (result.state === 'error') {
          toast.error(
            result.lastErrorUserMessage ??
              result.error ??
              'YouTube import failed'
          );
        } else {
          toast.success(`Imported ${imported} of ${discovered} YouTube videos`);
        }
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'YouTube import failed'
        );
      }
    });
  };
  const stageTabs = (
    <div
      role='tablist'
      aria-label='Library Stages'
      data-testid='library-stage-tabs'
      data-youtube-connected={youtubeConnected ? 'true' : 'false'}
      className='flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-0.5 -m-0.5'
    >
      {STAGE_TABS.map(tab => (
        <Button
          key={tab}
          type='button'
          size='sm'
          variant='ghost'
          id={`library-stage-${tab}-tab`}
          role='tab'
          aria-selected={stage === tab}
          aria-controls='library-catalog-panel'
          tabIndex={stage === tab ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setMode(tab)}
          className='rounded-md px-3 py-1 text-sm text-secondary-token aria-selected:bg-surface-1 aria-selected:text-primary-token'
        >
          {LIBRARY_STAGE_LABELS[tab]}
        </Button>
      ))}
    </div>
  );

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      {documentId ? (
        <div className='flex h-10 shrink-0 items-center gap-2 px-3'>
          {stageTabs}
        </div>
      ) : null}
      {documentId ? (
        <div
          id='library-catalog-panel'
          role='tabpanel'
          aria-labelledby={`library-stage-${stage}-tab`}
          className='flex min-h-0 flex-1'
        >
          <CreatorDocumentsWorkspace
            key={creatorProfileId}
            creatorProfileId={creatorProfileId}
            initialDocuments={creatorDocuments}
            initialNextCursor={creatorDocumentsNextCursor}
            initialLoadFailed={creatorDocumentsLoadFailed}
            onUnsavedDraftChange={setHasUnsavedDocumentDraft}
            onDiscardDraftsReady={discard => {
              discardDocumentDraftsRef.current = discard;
            }}
          />
        </div>
      ) : (
        <div
          id='library-catalog-panel'
          role='tabpanel'
          aria-labelledby={`library-stage-${stage}-tab`}
          className='flex min-h-0 flex-1'
        >
          <ReleaseCatalogPageClient
            view='assets'
            merchCards={merchCards}
            archivedMerchCards={archivedMerchCards}
            archivedReleases={archivedReleases}
            approvalStatusByAssetId={approvalStatusByAssetId}
            profileVisibilityByAssetId={profileVisibilityByAssetId}
            assetShareByAssetId={assetShareByAssetId}
            creatorDocuments={creatorDocuments}
            youtubeVideos={youtubeVideos}
            merchProducts={merchCards.map(card => ({
              id: card.id,
              title: card.title,
            }))}
            relationships={relationships}
            postReleaseBundle={postReleaseBundle}
            youtubeConnected={youtubeConnected}
            isImportingYouTube={isImportingYouTube}
            onImportYouTube={handleYouTubeImport}
          />
        </div>
      )}
      <ConfirmDialog
        open={pendingMode !== null}
        onOpenChange={open => {
          if (!open) setPendingMode(null);
        }}
        title='Discard Unsaved Changes?'
        body='Unsaved document changes will be lost.'
        confirmLabel='Discard'
        variant='destructive'
        onConfirm={() => {
          if (!pendingMode) return;
          applyMode(pendingMode);
          setPendingMode(null);
        }}
      />
    </div>
  );
}
