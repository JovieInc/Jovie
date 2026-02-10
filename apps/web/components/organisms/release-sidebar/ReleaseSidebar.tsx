'use client';

/**
 * ReleaseSidebar Component
 *
 * A sidebar component for displaying and editing release details,
 * including artwork, title, release date, and DSP links.
 */

import type { CommonDropdownItem } from '@jovie/ui';
import { Button } from '@jovie/ui';
import { Copy, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
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
import type { ReleaseSidebarProps } from './types';
import { useReleaseSidebar } from './useReleaseSidebar';

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
  onAddDspLink,
  onRemoveDspLink,
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
    isAddingDspLink,
    isRemovingDspLink,
    handleArtworkUpload,
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
    onAddDspLink,
    onRemoveDspLink,
  });

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

        <div className='flex-1 divide-y divide-subtle overflow-auto px-4 py-4'>
          {release ? (
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
                />
              </div>

              <div className='py-5'>
                <ReleaseFields
                  title={release.title}
                  releaseDate={release.releaseDate}
                  smartLinkPath={release.smartLinkPath}
                />
              </div>

              <div className='py-5'>
                <ReleaseMetadata release={release} />
              </div>

              <div className='py-5'>
                <ReleaseTrackList release={release} />
              </div>

              <div className='pt-5'>
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
                />
              </div>

              {isEditable && (
                <div className='py-5'>
                  <ReleaseSettings allowDownloads={allowDownloads} />
                </div>
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
          ) : (
            <p className='text-xs text-sidebar-muted'>
              Select a release in the table to view its details.
            </p>
          )}
        </div>
      </div>
    </RightDrawer>
  );
}
