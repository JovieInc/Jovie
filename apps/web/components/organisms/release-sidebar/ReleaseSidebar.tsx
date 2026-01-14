'use client';

/**
 * ReleaseSidebar Component
 *
 * A sidebar component for displaying and editing release details,
 * including artwork, title, release date, and DSP links.
 */

import { Button } from '@jovie/ui';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { ReleaseArtwork } from './ReleaseArtwork';
import { ReleaseDspLinks } from './ReleaseDspLinks';
import { ReleaseFields } from './ReleaseFields';
import { ReleaseSidebarHeader } from './ReleaseSidebarHeader';
import type { ReleaseSidebarProps } from './types';
import { useReleaseSidebar } from './useReleaseSidebar';

export function ReleaseSidebar({
  release,
  mode,
  isOpen,
  providerConfig,
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
    handleTitleChange,
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

  return (
    <RightDrawer
      isOpen={isOpen}
      width={SIDEBAR_WIDTH}
      ariaLabel='Release details'
      onKeyDown={handleKeyDown}
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
          {!release ? (
            <p className='text-xs text-sidebar-muted'>
              Select a release in the table to view its details.
            </p>
          ) : (
            <>
              <ReleaseArtwork
                artworkUrl={release.artworkUrl}
                title={release.title}
                releaseDate={release.releaseDate}
                canUploadArtwork={canUploadArtwork}
                onArtworkUpload={
                  canUploadArtwork ? handleArtworkUpload : undefined
                }
              />

              <ReleaseFields
                title={release.title}
                releaseDate={release.releaseDate}
                smartLinkPath={release.smartLinkPath}
                isEditable={isEditable}
                onTitleChange={handleTitleChange}
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

              {isEditable && onSave && release && (
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
        </div>
      </div>
    </RightDrawer>
  );
}
