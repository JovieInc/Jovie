'use client';

/**
 * Bulk Actions Hook
 *
 * Handles bulk operations on selected creator profiles.
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { useAdminBulkRefreshMutation } from '@/lib/queries';
import type { AdminCreatorProfileRow } from '../types';

export interface BulkActionsParams {
  profiles: AdminCreatorProfileRow[];
  selectedIds: Set<string>;
  confirmBulkDelete: (count: number) => Promise<boolean>;
  toggleVerification: (
    id: string,
    verified: boolean
  ) => Promise<{ success: boolean }>;
  toggleFeatured: (
    id: string,
    featured: boolean
  ) => Promise<{ success: boolean }>;
  toggleMarketing: (
    id: string,
    optOut: boolean
  ) => Promise<{ success: boolean }>;
  deleteCreatorOrUser: (id: string) => Promise<{ success: boolean }>;
  clearSelection: () => void;
}

export interface BulkActions {
  handleBulkVerify: () => Promise<void>;
  handleBulkUnverify: () => Promise<void>;
  handleBulkFeature: () => Promise<void>;
  handleBulkUnfeature: () => Promise<void>;
  handleBulkRefreshMusicFetch: () => Promise<void>;
  handleBulkEnableMarketing: () => Promise<void>;
  handleBulkDisableMarketing: () => Promise<void>;
  handleBulkDelete: () => Promise<void>;
  handleClearSelection: () => void;
}

/**
 * Shared helper: executes an action on each selected profile, toasts results,
 * then clears selection and refreshes.
 */
export async function executeBulkAction({
  profiles,
  selectedIds,
  action,
  successLabel,
  failureLabel,
  clearSelection,
  refresh,
}: {
  profiles: AdminCreatorProfileRow[];
  selectedIds: Set<string>;
  action: (profile: AdminCreatorProfileRow) => Promise<{ success: boolean }>;
  successLabel: string;
  failureLabel: string;
  clearSelection: () => void;
  refresh: () => void;
}): Promise<void> {
  const selectedProfiles = profiles.filter(p => selectedIds.has(p.id));
  if (selectedProfiles.length === 0) return;

  const results = await Promise.all(selectedProfiles.map(action));
  const failedCount = results.filter(r => !r.success).length;

  if (failedCount > 0) {
    toast.error(
      `Failed to ${failureLabel} ${failedCount} creator${failedCount > 1 ? 's' : ''}`
    );
  } else {
    toast.success(
      `${successLabel} ${selectedProfiles.length} creator${selectedProfiles.length > 1 ? 's' : ''}`
    );
  }
  clearSelection();
  refresh();
}

export function useBulkActions({
  profiles,
  selectedIds,
  confirmBulkDelete,
  toggleVerification,
  toggleFeatured,
  toggleMarketing,
  deleteCreatorOrUser,
  clearSelection,
}: BulkActionsParams): BulkActions {
  const router = useRouter();
  const { mutateAsync: bulkRefresh } = useAdminBulkRefreshMutation();
  const refresh = useCallback(() => router.refresh(), [router]);

  const handleBulkVerify = useCallback(
    () =>
      executeBulkAction({
        profiles,
        selectedIds,
        action: p => toggleVerification(p.id, true),
        successLabel: 'Verified',
        failureLabel: 'verify',
        clearSelection,
        refresh,
      }),
    [profiles, selectedIds, toggleVerification, clearSelection, refresh]
  );

  const handleBulkUnverify = useCallback(
    () =>
      executeBulkAction({
        profiles,
        selectedIds,
        action: p => toggleVerification(p.id, false),
        successLabel: 'Unverified',
        failureLabel: 'unverify',
        clearSelection,
        refresh,
      }),
    [profiles, selectedIds, toggleVerification, clearSelection, refresh]
  );

  const handleBulkFeature = useCallback(
    () =>
      executeBulkAction({
        profiles,
        selectedIds,
        action: p => toggleFeatured(p.id, true),
        successLabel: 'Featured',
        failureLabel: 'feature',
        clearSelection,
        refresh,
      }),
    [profiles, selectedIds, toggleFeatured, clearSelection, refresh]
  );

  const handleBulkUnfeature = useCallback(
    () =>
      executeBulkAction({
        profiles,
        selectedIds,
        action: p => toggleFeatured(p.id, false),
        successLabel: 'Unfeatured',
        failureLabel: 'unfeature',
        clearSelection,
        refresh,
      }),
    [profiles, selectedIds, toggleFeatured, clearSelection, refresh]
  );

  const handleBulkEnableMarketing = useCallback(
    () =>
      executeBulkAction({
        profiles,
        selectedIds,
        action: p => toggleMarketing(p.id, false),
        successLabel: 'Enabled marketing for',
        failureLabel: 'enable marketing for',
        clearSelection,
        refresh,
      }),
    [profiles, selectedIds, toggleMarketing, clearSelection, refresh]
  );

  const handleBulkDisableMarketing = useCallback(
    () =>
      executeBulkAction({
        profiles,
        selectedIds,
        action: p => toggleMarketing(p.id, true),
        successLabel: 'Disabled marketing for',
        failureLabel: 'disable marketing for',
        clearSelection,
        refresh,
      }),
    [profiles, selectedIds, toggleMarketing, clearSelection, refresh]
  );

  const handleBulkRefreshMusicFetch = useCallback(async () => {
    const selectedProfileIds = profiles
      .filter(p => selectedIds.has(p.id))
      .map(p => p.id);

    if (selectedProfileIds.length === 0) {
      return;
    }

    try {
      const result = await bulkRefresh({ profileIds: selectedProfileIds });
      const queuedCount = Number(result.queuedCount ?? 0);

      if (queuedCount > 0) {
        toast.success(
          `Queued MusicFetch refresh for ${queuedCount} creator${queuedCount === 1 ? '' : 's'}`
        );
      } else {
        toast.info('No creators with Spotify links were eligible for refresh');
      }

      clearSelection();
      refresh();
    } catch {
      // Error toast handled by mutation's onError callback
    }
  }, [profiles, selectedIds, clearSelection, refresh, bulkRefresh]);

  const handleBulkDelete = useCallback(async () => {
    const selectedProfiles = profiles.filter(p => selectedIds.has(p.id));
    if (selectedProfiles.length === 0) return;

    const confirmed = await confirmBulkDelete(selectedProfiles.length);
    if (!confirmed) return;

    const results = await Promise.all(
      selectedProfiles.map(p => deleteCreatorOrUser(p.id))
    );
    const failedCount = results.filter(r => !r.success).length;
    if (failedCount > 0) {
      toast.error(
        `Failed to delete ${failedCount} creator${failedCount > 1 ? 's' : ''}`
      );
    } else {
      toast.success(
        `Deleted ${selectedProfiles.length} creator${selectedProfiles.length > 1 ? 's' : ''}`
      );
      clearSelection();
      refresh();
    }
  }, [
    profiles,
    selectedIds,
    confirmBulkDelete,
    deleteCreatorOrUser,
    clearSelection,
    refresh,
  ]);

  const handleClearSelection = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return {
    handleBulkVerify,
    handleBulkUnverify,
    handleBulkFeature,
    handleBulkUnfeature,
    handleBulkRefreshMusicFetch,
    handleBulkEnableMarketing,
    handleBulkDisableMarketing,
    handleBulkDelete,
    handleClearSelection,
  };
}
