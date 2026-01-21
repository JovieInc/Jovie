'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

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
        const response = await fetch('/app/admin/creators/toggle-verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ profileId, nextVerified }),
        });

        const payload = (await response.json()) as {
          success?: boolean;
          isVerified?: boolean;
          error?: string;
        };

        if (!response.ok || !payload.success) {
          const errorMessage =
            payload.error ?? 'Failed to update verification status';
          setStatuses(prev => ({
            ...prev,
            [profileId]: 'error',
          }));
          resetStatus(profileId);
          return { success: false, error: errorMessage };
        }

        const updatedVerified =
          typeof payload.isVerified === 'boolean'
            ? payload.isVerified
            : nextVerified;

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
    [resetStatus]
  );

  return {
    profiles,
    statuses,
    toggleVerification,
  };
}
