'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import {
  useResetProviderOverrideMutation,
  useSaveProviderOverrideMutation,
  useSyncReleasesFromSpotifyMutation,
} from '@/lib/queries';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import type {
  DraftState,
  ReleaseProviderMatrixProps,
  SortState,
  UseReleaseProviderMatrixReturn,
} from './types';

/**
 * Extract provider URL from release, defaulting to empty string.
 * Extracted to reduce nesting depth in handleReset.
 */
function getProviderUrl(
  release: ReleaseViewModel,
  provider: ProviderKey
): string {
  return release.providers.find(item => item.key === provider)?.url ?? '';
}

export function useReleaseProviderMatrix({
  profileId,
  releases,
  providerConfig,
  primaryProviders,
}: Omit<
  ReleaseProviderMatrixProps,
  'spotifyConnected'
>): UseReleaseProviderMatrixReturn {
  const [rawRows, setRawRows] = useState<ReleaseViewModel[]>(releases);
  const [editingRelease, setEditingRelease] = useState<ReleaseViewModel | null>(
    null
  );
  const [drafts, setDrafts] = useState<DraftState>({});

  // TanStack Query mutations
  const saveProviderMutation = useSaveProviderOverrideMutation();
  const resetProviderMutation = useResetProviderOverrideMutation();
  const syncMutation = useSyncReleasesFromSpotifyMutation(profileId);

  const isSaving =
    saveProviderMutation.isPending || resetProviderMutation.isPending;
  const isSyncing = syncMutation.isPending;

  // These are no longer needed since UnifiedTable handles sorting internally,
  // but kept for backward compatibility with return interface
  const headerElevated = false;
  const sortState: SortState = { column: 'releaseDate', direction: 'desc' };
  const toggleSort = useCallback(() => {
    // No-op: UnifiedTable handles sorting internally now
  }, []);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // No custom sorting needed - UnifiedTable handles this
  const rows = rawRows;

  const providerList = useMemo(
    () =>
      (Object.keys(providerConfig) as ProviderKey[]).map(key => ({
        key,
        label: providerConfig[key].label,
        accent: providerConfig[key].accent,
        isPrimary: primaryProviders.includes(key),
      })),
    [providerConfig, primaryProviders]
  );

  const openEditor = (release: ReleaseViewModel) => {
    setEditingRelease(release);
    const nextDrafts: DraftState = {};
    release.providers.forEach(provider => {
      nextDrafts[provider.key] = provider.url ?? '';
    });
    setDrafts(nextDrafts);
  };

  const closeEditor = useCallback(() => {
    setEditingRelease(null);
    setDrafts({});
  }, []);

  const updateRow = (updated: ReleaseViewModel) => {
    setRawRows(prev =>
      prev.map(row => (row.id === updated.id ? { ...updated } : row))
    );
    setEditingRelease(current =>
      current && current.id === updated.id ? { ...updated } : current
    );
  };

  const handleCopy = async (path: string, label: string, testId: string) => {
    const textToCopy =
      path.startsWith('http://') || path.startsWith('https://')
        ? path
        : path.startsWith('/')
          ? `${getBaseUrl()}${path}`
          : path;
    const success = await copyToClipboard(textToCopy);
    if (success) {
      toast.success(`${label} copied`, { id: testId });
    } else {
      toast.error('Unable to copy link', { id: `${testId}-error` });
    }
    return textToCopy;
  };

  const handleSave = (provider: ProviderKey) => {
    if (!editingRelease) return;
    const url = drafts[provider]?.trim() ?? '';
    if (!url) {
      toast.error('Enter a URL before saving');
      return;
    }

    saveProviderMutation.mutate(
      {
        profileId: editingRelease.profileId,
        releaseId: editingRelease.id,
        provider,
        url,
      },
      {
        onSuccess: updated => {
          updateRow(updated);
          toast.success('Link updated');
        },
        onError: error => {
          console.error(error);
          toast.error('Failed to save override');
        },
      }
    );
  };

  const handleAddUrl = async (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => {
    const release = rawRows.find(r => r.id === releaseId);
    if (!release) return;

    saveProviderMutation.mutate(
      {
        profileId: release.profileId,
        releaseId,
        provider,
        url,
      },
      {
        onSuccess: updated => {
          updateRow(updated);
          toast.success(`${providerConfig[provider].label} link added`);
        },
        onError: error => {
          console.error(error);
          toast.error('Failed to add link');
        },
      }
    );
  };

  const handleReset = (provider: ProviderKey) => {
    if (!editingRelease) return;

    resetProviderMutation.mutate(
      {
        profileId: editingRelease.profileId,
        releaseId: editingRelease.id,
        provider,
      },
      {
        onSuccess: updated => {
          updateRow(updated);
          setDrafts(prev => ({
            ...prev,
            [provider]: getProviderUrl(updated, provider),
          }));
          toast.success('Reverted to detected link');
        },
        onError: error => {
          console.error(error);
          toast.error('Failed to reset link');
        },
      }
    );
  };

  const handleSync = () => {
    if (!profileId) {
      toast.error('Missing profile ID');
      return;
    }
    syncMutation.mutate(undefined, {
      onSuccess: result => {
        if (result.success) {
          toast.success(result.message);
          // Query will auto-refetch via invalidation in mutation hook
        } else {
          toast.error(result.message);
        }
      },
      onError: error => {
        console.error(error);
        toast.error('Failed to sync from Spotify');
      },
    });
  };

  const totalReleases = rows.length;
  const totalOverrides = rows.reduce(
    (count, release) =>
      count + release.providers.filter(p => p.source === 'manual').length,
    0
  );

  return {
    rows,
    setRows: setRawRows,
    editingRelease,
    drafts,
    isSaving,
    isSyncing,
    headerElevated,
    tableContainerRef,
    providerList,
    totalReleases,
    totalOverrides,
    sortState,
    toggleSort,
    openEditor,
    closeEditor,
    handleCopy,
    handleSave,
    handleReset,
    handleSync,
    handleAddUrl,
    setDrafts,
  };
}
