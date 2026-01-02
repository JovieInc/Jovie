'use client';

import { useCallback, useState } from 'react';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import type { UseDashboardTippingReturn } from './types';

/**
 * Hook to manage dashboard tipping state and handlers.
 */
export function useDashboardTipping(): UseDashboardTippingReturn {
  const dashboardData = useDashboardData();
  const [artist, setArtist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );
  const [venmoHandle, setVenmoHandle] = useState(
    artist?.venmo_handle?.replace(/^@/, '') || ''
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const hasVenmoHandle = Boolean(artist?.venmo_handle);

  const handleSaveVenmo = useCallback(async () => {
    if (!artist) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            venmo_handle: venmoHandle ? `@${venmoHandle}` : '',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update Venmo handle');
      }

      const normalizedHandle = venmoHandle ? `@${venmoHandle}` : '';
      const updatedArtist = { ...artist, venmo_handle: normalizedHandle };
      setArtist(updatedArtist);
      setIsEditing(false);
      setSaveSuccess(`Connected to ${normalizedHandle}`);
      setTimeout(() => setSaveSuccess(null), 2500);
    } catch (error) {
      console.error('Failed to update Venmo handle:', error);
    } finally {
      setIsSaving(false);
    }
  }, [venmoHandle, artist]);

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
    isSaving,
    saveSuccess,
    hasVenmoHandle,
    handleSaveVenmo,
    handleCancel,
  };
}
