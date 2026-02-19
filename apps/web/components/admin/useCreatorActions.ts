'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

/**
 * Manages creator profile actions (feature, marketing, delete) with optimistic updates.
 *
 * Uses an overlay pattern instead of duplicating the profiles array:
 * - `initialProfiles` is the source of truth (comes from useCreatorVerification or server)
 * - Optimistic overrides are stored in a separate map and merged on read
 * - This eliminates the useEffect sync delay that caused state to be overwritten
 *   when useCreatorVerification updated profiles after a verify action
 */
export function useCreatorActions(
  initialProfiles: AdminCreatorProfileRow[]
): UseCreatorActionsResult {
  // Optimistic field overrides keyed by profile ID
  const [overrides, setOverrides] = useState<
    Map<string, Partial<AdminCreatorProfileRow>>
  >(new Map());
  // IDs of profiles optimistically removed (pending delete confirmation from server)
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
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

  // Derive profiles by applying optimistic overrides on top of initialProfiles.
  // When initialProfiles changes (e.g. after a verify action updates useCreatorVerification),
  // this immediately reflects those changes without a useEffect delay.
  const profiles = useMemo(() => {
    const filtered =
      deletedIds.size > 0
        ? initialProfiles.filter(p => !deletedIds.has(p.id))
        : initialProfiles;

    if (overrides.size === 0) return filtered;

    return filtered.map(p => {
      const override = overrides.get(p.id);
      return override ? { ...p, ...override } : p;
    });
  }, [initialProfiles, overrides, deletedIds]);

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

  const setOverride = useCallback(
    (profileId: string, fields: Partial<AdminCreatorProfileRow>) => {
      setOverrides(prev => {
        const next = new Map(prev);
        const existing = next.get(profileId);
        next.set(profileId, existing ? { ...existing, ...fields } : fields);
        return next;
      });
    },
    []
  );

  const clearOverride = useCallback(
    (profileId: string, field: keyof AdminCreatorProfileRow) => {
      setOverrides(prev => {
        const existing = prev.get(profileId);
        if (!existing) return prev;

        const next = new Map(prev);
        const { [field]: _, ...rest } = existing;
        if (Object.keys(rest).length === 0) {
          next.delete(profileId);
        } else {
          next.set(profileId, rest);
        }
        return next;
      });
    },
    []
  );

  const toggleFeatured = useCallback(
    async (profileId: string, nextFeatured: boolean) => {
      setOverride(profileId, { isFeatured: nextFeatured });
      setStatus(profileId, 'loading');

      try {
        await toggleFeaturedMutation.mutateAsync({ profileId, nextFeatured });
        // On success, clear the override — server data will reflect the change
        // after revalidation. Keep the override until then for visual continuity.
        setStatus(profileId, 'success');
        resetStatus(profileId);
        return { success: true };
      } catch (error) {
        // Revert optimistic override
        clearOverride(profileId, 'isFeatured');
        setStatus(profileId, 'error');
        resetStatus(profileId);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to update featured status';
        return { success: false, error: errorMessage };
      }
    },
    [resetStatus, setStatus, setOverride, clearOverride, toggleFeaturedMutation]
  );

  const toggleMarketing = useCallback(
    async (profileId: string, nextMarketingOptOut: boolean) => {
      setOverride(profileId, { marketingOptOut: nextMarketingOptOut });
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
        clearOverride(profileId, 'marketingOptOut');
        setStatus(profileId, 'error');
        resetStatus(profileId);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to update marketing preferences';
        return { success: false, error: errorMessage };
      }
    },
    [
      resetStatus,
      setStatus,
      setOverride,
      clearOverride,
      toggleMarketingMutation,
    ]
  );

  const deleteCreatorOrUser = useCallback(
    async (profileId: string) => {
      setStatus(profileId, 'loading');

      try {
        await deleteCreatorMutation.mutateAsync({ profileId });
        setDeletedIds(prev => {
          const next = new Set(prev);
          next.add(profileId);
          return next;
        });
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
