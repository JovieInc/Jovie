'use client';

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  resetProviderOverride,
  saveProviderOverride,
  syncFromSpotify,
} from '@/app/app/dashboard/releases/actions';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
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
  const [isSaving, startSaving] = useTransition();
  const [isSyncing, startSyncing] = useTransition();

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

  const closeEditor = () => {
    setEditingRelease(null);
    setDrafts({});
  };

  const updateRow = (updated: ReleaseViewModel) => {
    setRawRows(prev =>
      prev.map(row => (row.id === updated.id ? { ...updated } : row))
    );
    setEditingRelease(current =>
      current && current.id === updated.id ? { ...updated } : current
    );
  };

  const handleCopy = async (path: string, label: string, testId: string) => {
    const absoluteUrl = `${getBaseUrl()}${path}`;
    const success = await copyToClipboard(absoluteUrl);
    if (success) {
      toast.success(`${label} copied`, { id: testId });
    } else {
      toast.error('Unable to copy link', { id: `${testId}-error` });
    }
    return absoluteUrl;
  };

  const handleSave = (provider: ProviderKey) => {
    if (!editingRelease) return;
    const url = drafts[provider]?.trim() ?? '';
    if (!url) {
      toast.error('Enter a URL before saving');
      return;
    }

    startSaving(async () => {
      try {
        const updated = await saveProviderOverride({
          profileId: editingRelease.profileId,
          releaseId: editingRelease.id,
          provider,
          url,
        });
        updateRow(updated);
        toast.success('Link updated');
      } catch (error) {
        console.error(error);
        toast.error('Failed to save override');
      }
    });
  };

  const handleAddUrl = async (
    releaseId: string,
    provider: ProviderKey,
    url: string
  ) => {
    const release = rawRows.find(r => r.id === releaseId);
    if (!release) return;

    startSaving(async () => {
      try {
        const updated = await saveProviderOverride({
          profileId: release.profileId,
          releaseId,
          provider,
          url,
        });
        updateRow(updated);
        toast.success(`${providerConfig[provider].label} link added`);
      } catch (error) {
        console.error(error);
        toast.error('Failed to add link');
      }
    });
  };

  const handleReset = (provider: ProviderKey) => {
    if (!editingRelease) return;

    startSaving(async () => {
      try {
        const updated = await resetProviderOverride({
          profileId: editingRelease.profileId,
          releaseId: editingRelease.id,
          provider,
        });
        updateRow(updated);
        setDrafts(prev => ({
          ...prev,
          [provider]: getProviderUrl(updated, provider),
        }));
        toast.success('Reverted to detected link');
      } catch (error) {
        console.error(error);
        toast.error('Failed to reset link');
      }
    });
  };

  const handleSync = () => {
    startSyncing(async () => {
      try {
        const result = await syncFromSpotify();
        if (result.success) {
          toast.success(result.message);
          window.location.reload();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error(error);
        toast.error('Failed to sync from Spotify');
      }
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
