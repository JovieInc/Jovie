'use client';

import { useCallback, useState } from 'react';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { useUpdateVenmoMutation } from '@/lib/queries/useDashboardProfileQuery';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import type { UseDashboardTippingReturn } from './types';

/**
 * Hook to manage dashboard tipping state and handlers.
 */
export function useDashboardTipping(): UseDashboardTippingReturn {
  const dashboardData = useDashboardData();
  const updateVenmoMutation = useUpdateVenmoMutation();
  const [artist, setArtist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );
  const [venmoHandle, setVenmoHandle] = useState(
    artist?.venmo_handle?.replace(/^@/, '') || ''
  );
  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const hasVenmoHandle = Boolean(artist?.venmo_handle);

  const handleSaveVenmo = useCallback(async () => {
    if (!artist) return;

    try {
      const normalizedHandle = venmoHandle ? `@${venmoHandle}` : '';
      await updateVenmoMutation.mutateAsync({
        venmo_handle: normalizedHandle,
      });

      const updatedArtist = { ...artist, venmo_handle: normalizedHandle };
      setArtist(updatedArtist);
      setIsEditing(false);
      setSaveSuccess(`Connected to ${normalizedHandle}`);
      setTimeout(() => setSaveSuccess(null), 2500);
    } catch (error) {
      console.error('Failed to update Venmo handle:', error);
    }
  }, [venmoHandle, artist, updateVenmoMutation]);

  const handleCancel = useCallback(() => {
    if (!artist) return;
    setVenmoHandle(artist.venmo_handle?.replace(/^@/, '') || '');
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
