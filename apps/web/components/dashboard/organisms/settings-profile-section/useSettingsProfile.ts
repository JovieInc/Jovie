'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { debounce } from '@/lib/utils';
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
  debouncedProfileSave: ReturnType<typeof debounce> & { flush: () => void };
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

  const lastProfileSavedRef = useRef<{
    displayName: string;
    username: string;
  } | null>(null);

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
    async (next: { displayName: string; username: string }) => {
      const displayName = next.displayName.trim();
      const username = next.username.trim();

      if (!displayName || !username) {
        return;
      }

      const lastSaved = lastProfileSavedRef.current;
      if (
        lastSaved &&
        lastSaved.displayName === displayName &&
        lastSaved.username === username
      ) {
        return;
      }

      setProfileSaveStatus({ saving: true, success: null, error: null });

      try {
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

        const data = (await response.json().catch(() => ({}))) as {
          profile?: {
            username?: string;
            usernameNormalized?: string;
            displayName?: string;
            bio?: string | null;
          };
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || 'Failed to update profile');
        }

        lastProfileSavedRef.current = { displayName, username };

        if (data.profile && onArtistUpdate) {
          onArtistUpdate({
            ...artist,
            handle: data.profile.username ?? artist.handle,
            name: data.profile.displayName ?? artist.name,
            tagline: data.profile.bio ?? artist.tagline,
          });
        }

        setFormData(prev => ({
          ...prev,
          username: data.profile?.username ?? username,
          displayName: data.profile?.displayName ?? displayName,
        }));

        setProfileSaveStatus({ saving: false, success: true, error: null });
        onRefresh();
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to update profile';
        setProfileSaveStatus({ saving: false, success: false, error: message });
        notifications.error(message);
      }
    },
    [artist, notifications, onArtistUpdate, onRefresh]
  );

  useEffect(() => {
    lastProfileSavedRef.current = {
      displayName: artist.name || '',
      username: artist.handle || '',
    };
    setProfileSaveStatus({ saving: false, success: null, error: null });
  }, [artist.handle, artist.name]);

  const debouncedProfileSave = useMemo(
    () =>
      debounce(async (...args: unknown[]) => {
        const [next] = args as [{ displayName: string; username: string }];
        await saveProfile(next);
      }, 900),
    [saveProfile]
  );

  useEffect(() => {
    return () => {
      debouncedProfileSave.flush();
    };
  }, [debouncedProfileSave]);

  useEffect(() => {
    if (!profileSaveStatus.success) return;
    const timeoutId = window.setTimeout(() => {
      setProfileSaveStatus(prev => ({ ...prev, success: null }));
    }, 1500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [profileSaveStatus.success]);

  return {
    formData,
    setFormData,
    profileSaveStatus,
    setProfileSaveStatus,
    handleAvatarUpload,
    handleAvatarUpdate,
    debouncedProfileSave,
  };
}
