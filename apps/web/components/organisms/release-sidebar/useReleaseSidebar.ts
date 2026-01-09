'use client';

import { useCallback, useState } from 'react';
import { track } from '@/lib/analytics';
import type { ProviderKey } from '@/lib/discography/types';
import type { Release, ReleaseSidebarProps } from './types';
import { isFormElement, isValidUrl } from './utils';

export interface UseReleaseSidebarReturn {
  isAddingLink: boolean;
  setIsAddingLink: (value: boolean) => void;
  newLinkUrl: string;
  setNewLinkUrl: (value: string) => void;
  selectedProvider: ProviderKey | null;
  setSelectedProvider: (value: ProviderKey | null) => void;
  isEditable: boolean;
  hasRelease: boolean;
  canUploadArtwork: boolean;
  handleFieldChange: (updater: (current: Release) => Release) => void;
  handleArtworkUpload: (file: File) => Promise<string>;
  handleCopySmartLink: () => Promise<void>;
  handleTitleChange: (value: string) => void;
  handleAddLink: () => Promise<void>;
  handleRemoveLink: (provider: ProviderKey) => Promise<void>;
  handleNewLinkKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

export function useReleaseSidebar({
  release,
  mode,
  onClose,
  onReleaseChange,
  onArtworkUpload,
  onAddDspLink,
  onRemoveDspLink,
}: Pick<
  ReleaseSidebarProps,
  | 'release'
  | 'mode'
  | 'onClose'
  | 'onReleaseChange'
  | 'onArtworkUpload'
  | 'onAddDspLink'
  | 'onRemoveDspLink'
>): UseReleaseSidebarReturn {
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey | null>(
    null
  );

  const isEditable = mode === 'admin';
  const hasRelease = Boolean(release);

  const handleFieldChange = useCallback(
    (updater: (current: Release) => Release) => {
      if (!release || !onReleaseChange) return;
      onReleaseChange(updater(release));
    },
    [release, onReleaseChange]
  );

  const handleArtworkUpload = useCallback(
    async (file: File) => {
      if (!release || !onArtworkUpload || !onReleaseChange) {
        return release?.artworkUrl ?? '';
      }
      track('release_artwork_upload_start', { releaseId: release.id });
      const newUrl = await onArtworkUpload(file, release);
      onReleaseChange({ ...release, artworkUrl: newUrl });
      track('release_artwork_upload_success', { releaseId: release.id });
      return newUrl;
    },
    [release, onArtworkUpload, onReleaseChange]
  );

  const handleCopySmartLink = useCallback(async () => {
    if (!release?.smartLinkPath) return;
    try {
      const url = new URL(
        release.smartLinkPath,
        window.location.origin
      ).toString();
      await navigator.clipboard.writeText(url);
      track('release_smart_link_copied', { releaseId: release.id });
    } catch (error) {
      console.error('Failed to copy smart link', error);
    }
  }, [release]);

  const handleTitleChange = useCallback(
    (value: string) => {
      handleFieldChange(current => ({ ...current, title: value }));
    },
    [handleFieldChange]
  );

  const handleAddLink = useCallback(async () => {
    if (!release || !onAddDspLink || !selectedProvider) return;
    const trimmedUrl = newLinkUrl.trim();
    if (!isValidUrl(trimmedUrl)) return;

    try {
      await onAddDspLink(release.id, selectedProvider, trimmedUrl);
      track('release_dsp_link_added', {
        releaseId: release.id,
        provider: selectedProvider,
      });
      setIsAddingLink(false);
      setNewLinkUrl('');
      setSelectedProvider(null);
    } catch (error) {
      console.error('Failed to add DSP link', error);
    }
  }, [release, onAddDspLink, newLinkUrl, selectedProvider]);

  const handleRemoveLink = useCallback(
    async (provider: ProviderKey) => {
      if (!release || !onRemoveDspLink) return;
      try {
        await onRemoveDspLink(release.id, provider);
        track('release_dsp_link_removed', {
          releaseId: release.id,
          provider,
        });
      } catch (error) {
        console.error('Failed to remove DSP link', error);
      }
    },
    [release, onRemoveDspLink]
  );

  const handleNewLinkKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (isValidUrl(newLinkUrl) && selectedProvider) {
          void handleAddLink();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setIsAddingLink(false);
        setNewLinkUrl('');
        setSelectedProvider(null);
      }
    },
    [newLinkUrl, selectedProvider, handleAddLink]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Escape' && !isFormElement(event.target)) {
        onClose?.();
      }
    },
    [onClose]
  );

  const canUploadArtwork =
    isEditable && Boolean(onArtworkUpload && release && onReleaseChange);

  return {
    isAddingLink,
    setIsAddingLink,
    newLinkUrl,
    setNewLinkUrl,
    selectedProvider,
    setSelectedProvider,
    isEditable,
    hasRelease,
    canUploadArtwork,
    handleFieldChange,
    handleArtworkUpload,
    handleCopySmartLink,
    handleTitleChange,
    handleAddLink,
    handleRemoveLink,
    handleNewLinkKeyDown,
    handleKeyDown,
  };
}
