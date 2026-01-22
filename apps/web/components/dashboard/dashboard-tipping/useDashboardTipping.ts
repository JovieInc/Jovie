'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { useUpdateVenmoMutation } from '@/lib/queries/useDashboardProfileQuery';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import type { UseDashboardTippingReturn } from './types';

/**
 * Hook to manage dashboard tipping state and handlers.
 *
 * Features:
 * - Syncs local state when dashboard data changes
 * - Calls router.refresh() to update server data after save
 * - Shows toast notifications for success/error states
 */
export function useDashboardTipping(): UseDashboardTippingReturn {
  const router = useRouter();
  const dashboardData = useDashboardData();
  const updateVenmoMutation = useUpdateVenmoMutation();

  const [artist, setArtist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );
  const [venmoHandle, setVenmoHandle] = useState(
    dashboardData.selectedProfile?.venmoHandle?.replace(/^@/, '') ?? ''
  );
  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Sync local state when dashboard data changes (e.g., after router.refresh())
  useEffect(() => {
    if (!dashboardData.selectedProfile) {
      setArtist(null);
      setVenmoHandle('');
      setIsEditing(false);
      return;
    }

    setArtist(
      convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
    );
    setVenmoHandle(
      dashboardData.selectedProfile.venmoHandle?.replace(/^@/, '') ?? ''
    );
  }, [dashboardData.selectedProfile]);

  const hasVenmoHandle = Boolean(artist?.venmo_handle);

  const handleSaveVenmo = useCallback(async () => {
    if (!artist) return;

    const trimmedHandle = venmoHandle.trim();
    if (!trimmedHandle) {
      toast.error('Please enter a Venmo username');
      return;
    }

    try {
      const normalizedHandle = `@${trimmedHandle}`;
      await updateVenmoMutation.mutateAsync({
        venmo_handle: normalizedHandle,
      });

      // Update local state for immediate UI feedback
      const updatedArtist = { ...artist, venmo_handle: normalizedHandle };
      setArtist(updatedArtist);
      setIsEditing(false);
      setSaveSuccess(`Connected to ${normalizedHandle}`);
      toast.success(`Venmo connected: ${normalizedHandle}`);

      // Refresh server data to ensure consistency
      router.refresh();

      setTimeout(() => setSaveSuccess(null), 2500);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update Venmo handle';
      toast.error(message);
    }
  }, [venmoHandle, artist, updateVenmoMutation, router]);

  const handleCancel = useCallback(() => {
    if (!artist) return;
    setVenmoHandle(artist.venmo_handle?.replace(/^@/, '') ?? '');
    setIsEditing(false);
  }, [artist]);

  return {
    artist,
    venmoHandle,
    setVenmoHandle,
    isEditing,
    setIsEditing,
    isSaving: updateVenmoMutation.isPending,
    saveSuccess,
    hasVenmoHandle,
    handleSaveVenmo,
    handleCancel,
  };
}
