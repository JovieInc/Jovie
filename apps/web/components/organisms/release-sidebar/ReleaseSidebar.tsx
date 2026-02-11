'use client';

/**
 * ReleaseSidebar Component
 *
 * A sidebar component for displaying and editing release details,
 * including artwork, title, release date, and DSP links.
 */

import type { CommonDropdownItem } from '@jovie/ui';
import { Button, SegmentControl } from '@jovie/ui';
import { Copy, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DrawerEmptyState } from '@/components/molecules/drawer';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { buildUTMContext, getUTMShareDropdownItems } from '@/lib/utm';
import { ReleaseArtwork } from './ReleaseArtwork';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import { ReleaseFields } from './ReleaseFields';
import { ReleaseMetadata } from './ReleaseMetadata';
import { ReleaseSettings } from './ReleaseSettings';
import { ReleaseSidebarHeader } from './ReleaseSidebarHeader';
import { ReleaseTrackList } from './ReleaseTrackList';
import { TrackDetailPanel, type TrackForDetail } from './TrackDetailPanel';
import type { ReleaseSidebarProps } from './types';
import { useReleaseSidebar } from './useReleaseSidebar';

/** Tab for organizing sidebar content into focused views */
type SidebarTab = 'catalog' | 'links' | 'details';

/** Options for sidebar tab segment control */
const SIDEBAR_TAB_OPTIONS = [
  { value: 'catalog' as const, label: 'Catalog' },
  { value: 'links' as const, label: 'Links' },
  { value: 'details' as const, label: 'Details' },
];

export function ReleaseSidebar({
  release,
  mode,
  isOpen,
  providerConfig,
  artistName,
  onClose,
  onRefresh,
  onReleaseChange,
  onSave,
  isSaving,
  onArtworkUpload,
  onArtworkRevert,
  onAddDspLink,
  onRemoveDspLink,
  onRescanIsrc,
  isRescanningIsrc = false,
  allowDownloads = false,
}: ReleaseSidebarProps) {
  const {
    isAddingLink,
    setIsAddingLink,
    newLinkUrl,
    setNewLinkUrl,
    selectedProvider,
    setSelectedProvider,
    isEditable,
    hasRelease,
    canUploadArtwork,
    canRevertArtwork,
    isAddingDspLink,
    isRemovingDspLink,
    handleArtworkUpload,
    handleArtworkRevert,
    handleCopySmartLink,
    handleAddLink,
    handleRemoveLink,
    handleNewLinkKeyDown,
    handleKeyDown,
  } = useReleaseSidebar({
    release,
    mode,
    onClose,
    onReleaseChange,
    onArtworkUpload,
    onArtworkRevert,
    onAddDspLink,
    onRemoveDspLink,
  });

  // Sidebar tab state
  const [activeTab, setActiveTab] = useState<SidebarTab>('catalog');

  // Track detail panel state — track shape comes from the sidebar route handler
  const [selectedTrack, setSelectedTrack] = useState<TrackForDetail | null>(
    null
  );

  // Reset selected track and tab when release changes to avoid stale views
  useEffect(() => {
    setSelectedTrack(null);
    setActiveTab('catalog');
  }, [release?.id]);

  const handleTrackClick = useCallback((track: TrackForDetail) => {
    setSelectedTrack(track);
  }, []);

  const handleBackToRelease = useCallback(() => {
    setSelectedTrack(null);
  }, []);

  const contextMenuItems = useMemo<CommonDropdownItem[]>(() => {
    if (!release) return [];

    const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;
    const items: CommonDropdownItem[] = [];

    const utmContext = buildUTMContext({
      smartLinkUrl,
      releaseSlug: release.slug,
      releaseTitle: release.title,
      artistName,
      releaseDate: release.releaseDate,
    });

    items.push(
      {
        type: 'action',
        id: 'copy-url',
        label: 'Copy smart link',
        icon: <Copy className='h-4 w-4' />,
        onClick: () => void handleCopySmartLink(),
      },
      {
        type: 'action',
        id: 'open-release',
        label: 'Open release',
        icon: <ExternalLink className='h-4 w-4' />,
        onClick: () => globalThis.open(smartLinkUrl, '_blank'),
      },
      // UTM share presets
      ...getUTMShareDropdownItems({
        smartLinkUrl,
        context: utmContext,
      }),
      { type: 'separator', id: 'sep-actions' },
      {
        type: 'action',
        id: 'refresh',
        label: 'Refresh',
        icon: <RefreshCw className='h-4 w-4' />,
        onClick: () => {
          if (onRefresh) {
            onRefresh();
          } else {
            globalThis.location.reload();
          }
        },
      },
      { type: 'separator', id: 'sep-danger' },
      {
        type: 'action',
        id: 'delete',
        label: 'Delete release',
        icon: <Trash2 className='h-4 w-4' />,
        onClick: () => toast.info('Delete not implemented'),
        variant: 'destructive',
      }
    );

    return items;
  }, [release, handleCopySmartLink, onRefresh, artistName]);

  return (
    <RightDrawer
      isOpen={isOpen}
      width={SIDEBAR_WIDTH}
      ariaLabel='Release details'
      onKeyDown={handleKeyDown}
      contextMenuItems={contextMenuItems}
    >
      <div data-testid='release-sidebar' className='flex h-full flex-col'>
        <ReleaseSidebarHeader
          release={release}
          hasRelease={hasRelease}
          onClose={onClose}
          onRefresh={onRefresh}
          onCopySmartLink={handleCopySmartLink}
        />

        {/* Always-visible artwork + release name */}
        {release && !selectedTrack && (
          <div className='shrink-0 border-b border-subtle px-4 py-3'>
            <ReleaseArtwork
              artworkUrl={release.artworkUrl}
              title={release.title}
              artistName={artistName}
              canUploadArtwork={canUploadArtwork}
              onArtworkUpload={
                canUploadArtwork ? handleArtworkUpload : undefined
              }
              allowDownloads={isEditable}
              releaseId={release.id}
            />
          </div>
        )}

        {/* Tab navigation */}
        {release && !selectedTrack && (
          <div className='border-b border-subtle px-3 py-1.5 shrink-0'>
            <SegmentControl
              value={activeTab}
              onValueChange={setActiveTab}
              options={SIDEBAR_TAB_OPTIONS}
              size='sm'
              aria-label='Release sidebar view'
            />
          </div>
        )}

        <div className='flex-1 divide-y divide-subtle overflow-auto px-4 py-4'>
          {selectedTrack && release && (
            <TrackDetailPanel
              track={selectedTrack}
              releaseTitle={release.title}
              onBack={handleBackToRelease}
            />
          )}
          {!(selectedTrack && release) && release && (
            <>
              {/* Catalog tab: Fields, Track list */}
              {activeTab === 'catalog' && (
                <>
                  <div className='pb-5'>
                    <ReleaseArtwork
                      artworkUrl={release.artworkUrl}
                      title={release.title}
                      artistName={artistName}
                      canUploadArtwork={canUploadArtwork}
                      onArtworkUpload={
                        canUploadArtwork ? handleArtworkUpload : undefined
                      }
                      allowDownloads={isEditable}
                      releaseId={release.id}
                      canRevert={canRevertArtwork}
                      onRevert={
                        canRevertArtwork ? handleArtworkRevert : undefined
                      }
                    />
                  </div>

                  <div className='py-5'>
                    <ReleaseFields
                      title={release.title}
                      releaseDate={release.releaseDate}
                      smartLinkPath={release.smartLinkPath}
                    />
                  </div>

                  <div className='pt-5'>
                    <ReleaseTrackList
                      release={release}
                      onTrackClick={handleTrackClick}
                    />
                  </div>
                </>
              )}

              {/* Links tab: DSP links management */}
              {activeTab === 'links' && (
                <div className='pt-0'>
                  <ReleaseDspLinks
                    release={release}
                    providerConfig={providerConfig}
                    isEditable={isEditable}
                    isAddingLink={isAddingLink}
                    newLinkUrl={newLinkUrl}
                    selectedProvider={selectedProvider}
                    isAddingDspLink={isAddingDspLink}
                    isRemovingDspLink={isRemovingDspLink}
                    onSetIsAddingLink={setIsAddingLink}
                    onSetNewLinkUrl={setNewLinkUrl}
                    onSetSelectedProvider={setSelectedProvider}
                    onAddLink={handleAddLink}
                    onRemoveLink={handleRemoveLink}
                    onNewLinkKeyDown={handleNewLinkKeyDown}
                    onRescanIsrc={onRescanIsrc}
                    isRescanningIsrc={isRescanningIsrc}
                  />
                </div>
              )}

              {/* Details tab: Metadata + Settings */}
              {activeTab === 'details' && (
                <>
                  <div className='pb-5'>
                    <ReleaseMetadata release={release} />
                  </div>

                  {isEditable && (
                    <div className='pt-5'>
                      <ReleaseSettings allowDownloads={allowDownloads} />
                    </div>
                  )}
                </>
              )}

              {isEditable && onSave && (
                <div className='pt-2 flex justify-end'>
                  <Button
                    type='button'
                    size='sm'
                    variant='primary'
                    onClick={() => onSave(release)}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save changes'}
                  </Button>
                </div>
              )}
            </>
          )}
          {!release && (
            <DrawerEmptyState message='Select a release in the table to view its details.' />
          )}
        </div>
      </div>
    </RightDrawer>
  );
}
