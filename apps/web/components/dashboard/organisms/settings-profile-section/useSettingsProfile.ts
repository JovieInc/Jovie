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
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useAutoSave } from '@/lib/pacer/hooks';
import type { Artist } from '@/types/db';
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
  saveProfile: (data: { displayName: string; username: string }) => void;
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
  const [formData, setFormData] = useState<ProfileFormData>({
    username: artist.handle || '',
    displayName: artist.name || '',
  });

  const [profileSaveStatus, setProfileSaveStatus] = useState<ProfileSaveStatus>(
    {
      saving: false,
      success: null,
      error: null,
    }
  );

  // Track last saved values for deduplication
  const lastProfileSavedRef = useRef<ProfileUpdateData | null>({
    displayName: artist.name || '',
    username: artist.handle || '',
  });

  // Store artist ref for async operations
  const artistRef = useRef(artist);
  artistRef.current = artist;

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
      const displayName = data.displayName.trim();
      const username = data.username.trim();

      if (!displayName || !username) {
        return;
      }

      // Deduplication check
      const lastSaved = lastProfileSavedRef.current;
      if (
        lastSaved?.displayName === displayName &&
        lastSaved?.username === username
      ) {
        return;
      }

      setProfileSaveStatus({ saving: true, success: null, error: null });

      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            username,
            displayName,
          },
        }),
      });

      const responseData = (await response.json().catch(() => ({}))) as {
        profile?: {
          username?: string;
          usernameNormalized?: string;
          displayName?: string;
          bio?: string | null;
        };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to update profile');
      }

      // Update cache
      lastProfileSavedRef.current = { displayName, username };

      // Update artist state
      if (responseData.profile && onArtistUpdate) {
        onArtistUpdate({
          ...artistRef.current,
          handle: responseData.profile.username ?? artistRef.current.handle,
          name: responseData.profile.displayName ?? artistRef.current.name,
          tagline: responseData.profile.bio ?? artistRef.current.tagline,
        });
      }

      // Update form data
      setFormData(prev => ({
        ...prev,
        username: responseData.profile?.username ?? username,
        displayName: responseData.profile?.displayName ?? displayName,
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

  const handleAvatarUpload = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const data = (await response.json().catch(() => ({}))) as {
      blobUrl?: string;
      error?: string;
      code?: string;
      retryable?: boolean;
    };

    if (!response.ok) {
      const error = new Error(data.error || 'Upload failed') as Error & {
        code?: string;
        retryable?: boolean;
      };
      error.code = data.code;
      error.retryable = data.retryable;
      throw error;
    }

    if (!data.blobUrl) {
      throw new Error('No image URL returned from upload');
    }

    return data.blobUrl;
  }, []);

  const handleAvatarUpdate = useCallback(
    async (imageUrl: string) => {
      const previousImage = artist.image_url;

      try {
        const response = await fetch('/api/dashboard/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            updates: {
              avatarUrl: imageUrl,
            },
          }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            (data as { error?: string }).error ||
              'Failed to update profile photo'
          );
        }

        const profile = (data as { profile?: { avatarUrl?: string } }).profile;
        const warning = (data as { warning?: string }).warning;

        if (onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            image_url: profile?.avatarUrl ?? imageUrl,
          });
        }

        if (warning) {
          notifications.warning(warning);
        }
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
    [artist, notifications, onArtistUpdate]
  );

  const saveProfile = useCallback(
    (data: { displayName: string; username: string }) => {
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
      displayName: artist.name || '',
      username: artist.handle || '',
    };
    setProfileSaveStatus({ saving: false, success: null, error: null });
  }, [artist.handle, artist.name]);

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
