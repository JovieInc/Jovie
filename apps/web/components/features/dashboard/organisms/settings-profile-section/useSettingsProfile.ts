'use client';

/**
 * Settings Profile Hook
 *
 * Manages profile form state with debounced auto-save using the shared
 * useAutoSave hook from TanStack Pacer.
 *
 * @see https://tanstack.com/pacer
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildProfileIdentityFields,
  buildProfileSaveState,
} from '@/features/profile/view-models';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useAutoSave } from '@/lib/pacer/hooks';
import {
  useProfileMutation,
  useProfileSaveMutation,
  useUserAvatarMutation,
} from '@/lib/queries';
import type { Artist, ArtistSettings } from '@/types/db';
import type { ProfileFormData, ProfileSaveStatus } from './types';

interface UseSettingsProfileOptions {
  artist: Artist;
  onArtistUpdate?: (updatedArtist: Artist) => void;
  onRefresh: () => void;
}

interface UseSettingsProfileReturn {
  formData: ProfileFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProfileFormData>>;
  profileSaveStatus: ProfileSaveStatus;
  setProfileSaveStatus: React.Dispatch<React.SetStateAction<ProfileSaveStatus>>;
  handleAvatarUpload: (file: File) => Promise<string>;
  handleAvatarUpdate: (imageUrl: string) => Promise<void>;
  /** Trigger debounced profile save */
  saveProfile: (data: ProfileUpdateData) => void;
  /** Flush pending save immediately */
  flushSave: () => void;
  /** Cancel pending save */
  cancelSave: () => void;
  /** Whether a save is pending */
  isSavePending: boolean;
}

// Use longer debounce than default (500ms) for profile saves
// to avoid excessive API calls during rapid form edits
const SAVE_DEBOUNCE_MS = 900;

interface ProfileUpdateData {
  displayName: string;
  username: string;
  location: string;
  hometown: string;
}

function normalizePlace(value: string): string | null {
  const trimmedValue = value.trim();
  return trimmedValue || null;
}

function getHometownFromSettings(
  settings: Record<string, unknown> | null | undefined
): string | null {
  const hometown = settings?.hometown;
  if (typeof hometown !== 'string') {
    return null;
  }

  const trimmedHometown = hometown.trim();
  return trimmedHometown || null;
}

/**
 * Hook to manage settings profile state and handlers.
 */
export function useSettingsProfile({
  artist,
  onArtistUpdate,
  onRefresh,
}: UseSettingsProfileOptions): UseSettingsProfileReturn {
  const notifications = useNotifications();
  const identityFields = buildProfileIdentityFields(artist);
  const [formData, setFormData] = useState<ProfileFormData>({
    username: identityFields.username,
    displayName: identityFields.displayName,
    location: identityFields.location,
    hometown: identityFields.hometown,
  });

  const [profileSaveStatus, setProfileSaveStatus] = useState<ProfileSaveStatus>(
    buildProfileSaveState()
  );

  // Track last saved values for deduplication
  const lastProfileSavedRef = useRef<ProfileUpdateData | null>({
    displayName: identityFields.displayName,
    username: identityFields.username,
    location: identityFields.location,
    hometown: identityFields.hometown,
  });

  // Store artist ref for async operations
  const artistRef = useRef(artist);
  useEffect(() => {
    artistRef.current = artist;
  }, [artist]);

  // TanStack Query mutation for profile saves (silent, for auto-save)
  const { mutateAsync: saveProfileMutation } = useProfileSaveMutation();

  // Store mutation ref for use in saveFn callback
  const saveProfileMutationRef = useRef(saveProfileMutation);
  useEffect(() => {
    saveProfileMutationRef.current = saveProfileMutation;
  }, [saveProfileMutation]);

  // TanStack Query mutation for avatar upload
  const { mutateAsync: uploadAvatarMutation } = useUserAvatarMutation();

  // TanStack Query mutation for avatar URL update (with notifications)
  const { mutateAsync: updateProfileMutation } = useProfileMutation({
    silent: true, // We handle notifications manually for avatar updates
  });

  // Use the shared auto-save hook
  const {
    save: triggerSave,
    flush,
    cancel,
    isSaving,
    isPending,
    error: saveError,
  } = useAutoSave<ProfileUpdateData>({
    saveFn: async data => {
      const displayName = data.displayName?.trim() ?? '';
      const username = data.username?.trim() ?? '';
      const location = normalizePlace(data.location);
      const hometown = normalizePlace(data.hometown);

      if (!displayName || !username) {
        return;
      }

      if (
        location &&
        hometown &&
        location.localeCompare(hometown, undefined, {
          sensitivity: 'accent',
        }) === 0
      ) {
        const message = 'Hometown must be different from your current location';
        setProfileSaveStatus({ saving: false, success: false, error: message });
        throw new Error(message);
      }

      // Deduplication check
      const lastSaved = lastProfileSavedRef.current;
      if (
        lastSaved?.displayName === displayName &&
        lastSaved?.username === username &&
        lastSaved?.location === (location ?? '') &&
        lastSaved?.hometown === (hometown ?? '')
      ) {
        return;
      }

      setProfileSaveStatus({ saving: true, success: null, error: null });

      let response;
      try {
        // Use TanStack Query mutation via ref to get latest function
        response = await saveProfileMutationRef.current({
          updates: {
            username,
            displayName,
            location,
            hometown,
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update profile';
        setProfileSaveStatus({ saving: false, success: false, error: message });
        // Re-throw so useAutoSave calls onError (which shows the toast)
        throw error;
      }

      // Update cache
      lastProfileSavedRef.current = {
        displayName,
        username,
        location: location ?? '',
        hometown: hometown ?? '',
      };

      const nextSettings = {
        ...artistRef.current.settings,
        ...(response.profile?.settings as Record<string, unknown> | null),
      } as ArtistSettings;
      const nextHometown =
        getHometownFromSettings(response.profile?.settings ?? null) ?? hometown;
      nextSettings.hometown = nextHometown;

      // Update artist state
      if (response.profile && onArtistUpdate) {
        onArtistUpdate({
          ...artistRef.current,
          handle: response.profile.username ?? artistRef.current.handle,
          name: response.profile.displayName ?? artistRef.current.name,
          location: response.profile.location ?? location,
          hometown: nextHometown,
          settings: nextSettings,
        });
      }

      // Update form data
      setFormData(prev => ({
        ...prev,
        username: response.profile?.username ?? username,
        displayName: response.profile?.displayName ?? displayName,
        location: response.profile?.location ?? location ?? '',
        hometown: nextHometown ?? '',
      }));

      setProfileSaveStatus({ saving: false, success: true, error: null });
    },
    wait: SAVE_DEBOUNCE_MS,
    onSuccess: () => {
      onRefresh();
    },
    onError: err => {
      const message = err.message || 'Failed to update profile';
      setProfileSaveStatus({ saving: false, success: false, error: message });
      notifications.error(message);
    },
  });

  // Sync saving state with hook
  useEffect(() => {
    if (isSaving) {
      setProfileSaveStatus(prev => ({ ...prev, saving: true }));
    }
  }, [isSaving]);

  // Handle save errors from hook
  useEffect(() => {
    if (saveError) {
      const message = saveError.message || 'Failed to update profile';
      setProfileSaveStatus({ saving: false, success: false, error: message });
    }
  }, [saveError]);

  const handleAvatarUpload = useCallback(
    async (file: File) => {
      // Use TanStack Query mutation for upload
      return uploadAvatarMutation(file);
    },
    [uploadAvatarMutation]
  );

  const handleAvatarUpdate = useCallback(
    async (imageUrl: string) => {
      const previousImage = artist.image_url;

      try {
        // Use TanStack Query mutation for profile update
        const response = await updateProfileMutation({
          updates: {
            avatarUrl: imageUrl,
          },
        });

        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            image_url: response.profile?.avatarUrl ?? imageUrl,
          });
        }

        if (response.warning) {
          notifications.warning(response.warning);
        }

        // Refresh server-side data so the avatar persists across navigations
        onRefresh();
      } catch (error) {
        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            image_url: previousImage,
          });
        }

        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to update profile photo';
        notifications.error(message);
      }
    },
    [artist, notifications, onArtistUpdate, onRefresh, updateProfileMutation]
  );

  const saveProfile = useCallback(
    (data: ProfileUpdateData) => {
      triggerSave(data);
    },
    [triggerSave]
  );

  const flushSave = useCallback(() => {
    void flush();
  }, [flush]);

  const cancelSave = useCallback(() => {
    cancel();
  }, [cancel]);

  // Reset status when artist changes
  useEffect(() => {
    lastProfileSavedRef.current = {
      displayName: identityFields.displayName,
      username: identityFields.username,
      location: identityFields.location,
      hometown: identityFields.hometown,
    };
    setFormData({
      displayName: identityFields.displayName,
      username: identityFields.username,
      location: identityFields.location,
      hometown: identityFields.hometown,
    });
    setProfileSaveStatus(buildProfileSaveState());
  }, [
    identityFields.displayName,
    identityFields.hometown,
    identityFields.location,
    identityFields.username,
  ]);

  // Clear success status after delay
  useEffect(() => {
    if (!profileSaveStatus.success) return;
    const timeoutId = setTimeout(() => {
      setProfileSaveStatus(prev => ({ ...prev, success: null }));
    }, 1500);
    return () => {
      clearTimeout(timeoutId);
    };
  }, [profileSaveStatus.success]);

  return {
    formData,
    setFormData,
    profileSaveStatus,
    setProfileSaveStatus,
    handleAvatarUpload,
    handleAvatarUpdate,
    saveProfile,
    flushSave,
    cancelSave,
    isSavePending: isPending,
  };
}
