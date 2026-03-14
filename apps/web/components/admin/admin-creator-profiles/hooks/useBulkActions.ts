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
  deleteCreatorOrUser: (id: string) => Promise<{ success: boolean }>;
  clearSelection: () => void;
}

export interface BulkActions {
  handleBulkVerify: () => Promise<void>;
  handleBulkUnverify: () => Promise<void>;
  handleBulkFeature: () => Promise<void>;
  handleBulkRefreshMusicFetch: () => Promise<void>;
  handleBulkDelete: () => Promise<void>;
  handleClearSelection: () => void;
}

export function useBulkActions({
  profiles,
  selectedIds,
  confirmBulkDelete,
  toggleVerification,
  toggleFeatured,
  deleteCreatorOrUser,
  clearSelection,
}: BulkActionsParams): BulkActions {
  const router = useRouter();
  const { mutateAsync: bulkRefresh } = useAdminBulkRefreshMutation();

  const handleBulkVerify = useCallback(async () => {
    const selectedProfiles = profiles.filter(p => selectedIds.has(p.id));
    const results = await Promise.all(
      selectedProfiles.map(p => toggleVerification(p.id, true))
    );
    const failedCount = results.filter(r => !r.success).length;
    if (failedCount > 0) {
      toast.error(
        `Failed to verify ${failedCount} creator${failedCount > 1 ? 's' : ''}`
      );
    } else {
      toast.success(
        `Verified ${selectedProfiles.length} creator${selectedProfiles.length > 1 ? 's' : ''}`
      );
    }
    clearSelection();
    router.refresh();
  }, [profiles, selectedIds, toggleVerification, clearSelection, router]);

  const handleBulkUnverify = useCallback(async () => {
    const selectedProfiles = profiles.filter(p => selectedIds.has(p.id));
    const results = await Promise.all(
      selectedProfiles.map(p => toggleVerification(p.id, false))
    );
    const failedCount = results.filter(r => !r.success).length;
    if (failedCount > 0) {
      toast.error(
        `Failed to unverify ${failedCount} creator${failedCount > 1 ? 's' : ''}`
      );
    } else {
      toast.success(
        `Unverified ${selectedProfiles.length} creator${selectedProfiles.length > 1 ? 's' : ''}`
      );
    }
    clearSelection();
    router.refresh();
  }, [profiles, selectedIds, toggleVerification, clearSelection, router]);

  const handleBulkFeature = useCallback(async () => {
    const selectedProfiles = profiles.filter(p => selectedIds.has(p.id));
    const results = await Promise.all(
      selectedProfiles.map(p => toggleFeatured(p.id, true))
    );
    const failedCount = results.filter(r => !r.success).length;
    if (failedCount > 0) {
      toast.error(
        `Failed to feature ${failedCount} creator${failedCount > 1 ? 's' : ''}`
      );
    } else {
      toast.success(
        `Featured ${selectedProfiles.length} creator${selectedProfiles.length > 1 ? 's' : ''}`
      );
    }
    clearSelection();
    router.refresh();
  }, [profiles, selectedIds, toggleFeatured, clearSelection, router]);

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
      router.refresh();
    } catch {
      // Error toast handled by mutation's onError callback
    }
  }, [profiles, selectedIds, clearSelection, router, bulkRefresh]);

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
      // Clear selection after successful deletion
      clearSelection();
      router.refresh();
    }
  }, [
    profiles,
    selectedIds,
    confirmBulkDelete,
    deleteCreatorOrUser,
    clearSelection,
    router,
  ]);

  const handleClearSelection = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  return {
    handleBulkVerify,
    handleBulkUnverify,
    handleBulkFeature,
    handleBulkRefreshMusicFetch,
    handleBulkDelete,
    handleClearSelection,
  };
}
