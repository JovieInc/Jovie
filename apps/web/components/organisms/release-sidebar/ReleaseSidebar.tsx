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
import { ReleaseArtwork } from './ReleaseArtwork';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import { ReleaseFields } from './ReleaseFields';
import { ReleaseSidebarHeader } from './ReleaseSidebarHeader';
import type { ReleaseSidebarProps } from './types';
import { useReleaseSidebar } from './useReleaseSidebar';

const CONTEXT_MENU_ITEM_CLASS =
  'rounded-md px-2 py-1 text-[12.5px] font-medium leading-[16px] [&_svg]:text-tertiary-token hover:[&_svg]:text-secondary-token data-[highlighted]:[&_svg]:text-secondary-token focus-visible:[&_svg]:text-secondary-token';

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

    items.push(
      {
        type: 'action',
        id: 'copy-url',
        label: 'Copy smart link',
        icon: <Copy className='h-4 w-4' />,
        onClick: () => void handleCopySmartLink(),
        className: CONTEXT_MENU_ITEM_CLASS,
      },
      {
        type: 'action',
        id: 'open-release',
        label: 'Open release',
        icon: <ExternalLink className='h-4 w-4' />,
        onClick: () => globalThis.open(smartLinkUrl, '_blank'),
        className: CONTEXT_MENU_ITEM_CLASS,
      },
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
        className: CONTEXT_MENU_ITEM_CLASS,
      },
      { type: 'separator', id: 'sep-1', className: '-mx-0.5 my-1' },
      {
        type: 'action',
        id: 'delete',
        label: 'Delete release',
        icon: <Trash2 className='h-4 w-4' />,
        onClick: () => toast.info('Delete not implemented'),
        variant: 'destructive',
        className: CONTEXT_MENU_ITEM_CLASS,
      }
    );

    return items;
  }, [release, handleCopySmartLink, onRefresh]);

  return (
    <RightDrawer
      isOpen={isOpen}
      width={SIDEBAR_WIDTH}
      ariaLabel='Release details'
      onKeyDown={handleKeyDown}
      contextMenuItems={contextMenuItems}
      className='bg-surface-1'
    >
      <div data-testid='release-sidebar' className='flex h-full flex-col'>
        <ReleaseSidebarHeader
          release={release}
          hasRelease={hasRelease}
          onClose={onClose}
          onRefresh={onRefresh}
          onCopySmartLink={handleCopySmartLink}
        />

        <div className='flex-1 space-y-6 overflow-auto px-4 py-4'>
          {release ? (
            <>
              <ReleaseArtwork
                artworkUrl={release.artworkUrl}
                title={release.title}
                artistName={artistName}
                canUploadArtwork={canUploadArtwork}
                onArtworkUpload={
                  canUploadArtwork ? handleArtworkUpload : undefined
                }
              />

              <ReleaseFields
                title={release.title}
                releaseDate={release.releaseDate}
                smartLinkPath={release.smartLinkPath}
              />

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
