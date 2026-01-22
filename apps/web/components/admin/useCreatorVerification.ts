'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { useToggleVerificationMutation } from '@/lib/queries/useCreatorVerificationMutation';

export type CreatorVerificationStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'error';

type ToggleVerificationResult = {
  success: boolean;
  isVerified?: boolean;
  error?: string;
};

type UseCreatorVerificationResult = {
  profiles: AdminCreatorProfileRow[];
  statuses: Record<string, CreatorVerificationStatus>;
  toggleVerification: (
    profileId: string,
    nextVerified: boolean
  ) => Promise<ToggleVerificationResult>;
};

export function useCreatorVerification(
  initialProfiles: AdminCreatorProfileRow[]
): UseCreatorVerificationResult {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [statuses, setStatuses] = useState<
    Record<string, CreatorVerificationStatus>
  >({});
  const statusTimeoutsRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  // TanStack Query mutation for cache invalidation
  const toggleVerificationMutation = useToggleVerificationMutation();

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

  const toggleVerification = useCallback(
    async (profileId: string, nextVerified: boolean) => {
      setStatuses(prev => ({
        ...prev,
        [profileId]: 'loading',
      }));

      try {
        const result = await toggleVerificationMutation.mutateAsync({
          profileId,
          nextVerified,
        });

        const updatedVerified = result.isVerified ?? nextVerified;

        setProfiles(prev =>
          prev.map(profile =>
            profile.id === profileId
              ? { ...profile, isVerified: updatedVerified }
              : profile
          )
        );

        setStatuses(prev => ({
          ...prev,
          [profileId]: 'success',
        }));
        resetStatus(profileId);

        return {
          success: true,
          isVerified: updatedVerified,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to update verification status';
        setStatuses(prev => ({
          ...prev,
          [profileId]: 'error',
        }));
        resetStatus(profileId);
        return { success: false, error: errorMessage };
      }
    },
    [resetStatus, toggleVerificationMutation]
  );

  return {
    profiles,
    statuses,
    toggleVerification,
  };
}
