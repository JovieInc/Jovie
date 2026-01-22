'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import {
  useDeleteCreatorMutation,
  useToggleFeaturedMutation,
  useToggleMarketingMutation,
} from '@/lib/queries/useCreatorActionsMutation';

export type CreatorActionStatus = 'idle' | 'loading' | 'success' | 'error';

type ActionResult = {
  success: boolean;
  error?: string;
};

type UseCreatorActionsResult = {
  profiles: AdminCreatorProfileRow[];
  statuses: Record<string, CreatorActionStatus>;
  toggleFeatured: (
    profileId: string,
    nextFeatured: boolean
  ) => Promise<ActionResult>;
  toggleMarketing: (
    profileId: string,
    nextMarketingOptOut: boolean
  ) => Promise<ActionResult>;
  deleteCreatorOrUser: (profileId: string) => Promise<ActionResult>;
};

export function useCreatorActions(
  initialProfiles: AdminCreatorProfileRow[]
): UseCreatorActionsResult {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [statuses, setStatuses] = useState<Record<string, CreatorActionStatus>>(
    {}
  );
  const statusTimeoutsRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  // TanStack Query mutations for cache invalidation
  const toggleFeaturedMutation = useToggleFeaturedMutation();
  const toggleMarketingMutation = useToggleMarketingMutation();
  const deleteCreatorMutation = useDeleteCreatorMutation();

  useEffect(() => {
    setProfiles(initialProfiles);
  }, [initialProfiles]);

  useEffect(() => {
    const timeouts = statusTimeoutsRef.current;
    return () => {
      Object.values(timeouts).forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  const setStatus = useCallback(
    (profileId: string, status: CreatorActionStatus) => {
      setStatuses(prev => ({ ...prev, [profileId]: status }));
    },
    []
  );

  const resetStatus = useCallback(
    (profileId: string, delay = 2200) => {
      const previousTimeout = statusTimeoutsRef.current[profileId];
      if (previousTimeout) {
        clearTimeout(previousTimeout);
      }

      statusTimeoutsRef.current[profileId] = setTimeout(() => {
        setStatus(profileId, 'idle');
        delete statusTimeoutsRef.current[profileId];
      }, delay);
    },
    [setStatus]
  );

  const updateProfile = useCallback(
    <K extends keyof AdminCreatorProfileRow>(
      profileId: string,
      field: K,
      value: AdminCreatorProfileRow[K]
    ) => {
      setProfiles(prev =>
        prev.map(p => (p.id === profileId ? { ...p, [field]: value } : p))
      );
    },
    []
  );

  const toggleFeatured = useCallback(
    async (profileId: string, nextFeatured: boolean) => {
      updateProfile(profileId, 'isFeatured', nextFeatured);
      setStatus(profileId, 'loading');

      try {
        await toggleFeaturedMutation.mutateAsync({ profileId, nextFeatured });
        setStatus(profileId, 'success');
        resetStatus(profileId);
        return { success: true };
      } catch (error) {
        updateProfile(profileId, 'isFeatured', !nextFeatured);
        setStatus(profileId, 'error');
        resetStatus(profileId);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to update featured status';
        return { success: false, error: errorMessage };
      }
    },
    [resetStatus, setStatus, updateProfile, toggleFeaturedMutation]
  );

  const toggleMarketing = useCallback(
    async (profileId: string, nextMarketingOptOut: boolean) => {
      updateProfile(profileId, 'marketingOptOut', nextMarketingOptOut);
      setStatus(profileId, 'loading');

      try {
        await toggleMarketingMutation.mutateAsync({
          profileId,
          nextMarketingOptOut,
        });
        setStatus(profileId, 'success');
        resetStatus(profileId);
        return { success: true };
      } catch (error) {
        updateProfile(profileId, 'marketingOptOut', !nextMarketingOptOut);
        setStatus(profileId, 'error');
        resetStatus(profileId);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to update marketing preferences';
        return { success: false, error: errorMessage };
      }
    },
    [resetStatus, setStatus, updateProfile, toggleMarketingMutation]
  );

  const deleteCreatorOrUser = useCallback(
    async (profileId: string) => {
      setStatus(profileId, 'loading');

      try {
        await deleteCreatorMutation.mutateAsync({ profileId });
        setProfiles(prev => prev.filter(p => p.id !== profileId));
        setStatus(profileId, 'success');
        return { success: true };
      } catch (error) {
        setStatus(profileId, 'error');
        resetStatus(profileId);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to delete creator/user';
        return { success: false, error: errorMessage };
      }
    },
    [resetStatus, setStatus, deleteCreatorMutation]
  );

  return {
    profiles,
    statuses,
    toggleFeatured,
    toggleMarketing,
    deleteCreatorOrUser,
  };
}
