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

  const resetStatus = useCallback((profileId: string, delay = 2200) => {
    const previousTimeout = statusTimeoutsRef.current[profileId];
    if (previousTimeout) {
      clearTimeout(previousTimeout);
    }

    statusTimeoutsRef.current[profileId] = setTimeout(() => {
      setStatuses(prev => ({
        ...prev,
        [profileId]: 'idle',
      }));
      delete statusTimeoutsRef.current[profileId];
    }, delay);
  }, []);

  const toggleFeatured = useCallback(
    async (profileId: string, nextFeatured: boolean) => {
      // Optimistic update
      setProfiles(prev =>
        prev.map(profile =>
          profile.id === profileId
            ? { ...profile, isFeatured: nextFeatured }
            : profile
        )
      );

      setStatuses(prev => ({
        ...prev,
        [profileId]: 'loading',
      }));

      try {
        await toggleFeaturedMutation.mutateAsync({ profileId, nextFeatured });

        setStatuses(prev => ({
          ...prev,
          [profileId]: 'success',
        }));
        resetStatus(profileId);

        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to update featured status';

        // Revert optimistic update
        setProfiles(prev =>
          prev.map(profile =>
            profile.id === profileId
              ? { ...profile, isFeatured: !nextFeatured }
              : profile
          )
        );

        setStatuses(prev => ({
          ...prev,
          [profileId]: 'error',
        }));
        resetStatus(profileId);
        return { success: false, error: errorMessage };
      }
    },
    [resetStatus, toggleFeaturedMutation]
  );

  const toggleMarketing = useCallback(
    async (profileId: string, nextMarketingOptOut: boolean) => {
      // Optimistic update
      setProfiles(prev =>
        prev.map(profile =>
          profile.id === profileId
            ? { ...profile, marketingOptOut: nextMarketingOptOut }
            : profile
        )
      );

      setStatuses(prev => ({
        ...prev,
        [profileId]: 'loading',
      }));

      try {
        await toggleMarketingMutation.mutateAsync({
          profileId,
          nextMarketingOptOut,
        });

        setStatuses(prev => ({
          ...prev,
          [profileId]: 'success',
        }));
        resetStatus(profileId);

        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to update marketing preferences';

        // Revert optimistic update
        setProfiles(prev =>
          prev.map(profile =>
            profile.id === profileId
              ? { ...profile, marketingOptOut: !nextMarketingOptOut }
              : profile
          )
        );

        setStatuses(prev => ({
          ...prev,
          [profileId]: 'error',
        }));
        resetStatus(profileId);
        return { success: false, error: errorMessage };
      }
    },
    [resetStatus, toggleMarketingMutation]
  );

  const deleteCreatorOrUser = useCallback(
    async (profileId: string) => {
      setStatuses(prev => ({
        ...prev,
        [profileId]: 'loading',
      }));

      try {
        await deleteCreatorMutation.mutateAsync({ profileId });

        // Remove from local state
        setProfiles(prev => prev.filter(p => p.id !== profileId));

        setStatuses(prev => ({
          ...prev,
          [profileId]: 'success',
        }));

        return { success: true };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to delete creator/user';
        setStatuses(prev => ({
          ...prev,
          [profileId]: 'error',
        }));
        resetStatus(profileId);
        return { success: false, error: errorMessage };
      }
    },
    [resetStatus, deleteCreatorMutation]
  );

  return {
    profiles,
    statuses,
    toggleFeatured,
    toggleMarketing,
    deleteCreatorOrUser,
  };
}
