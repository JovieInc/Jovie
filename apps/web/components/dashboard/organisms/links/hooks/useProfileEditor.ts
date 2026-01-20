/**
 * useProfileEditor Hook
 *
 * Custom hook for managing profile editing state including display name,
 * username, and avatar. Handles debounced saving and inline editing mode.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { useProfileSaveToasts } from '@/lib/hooks/useProfileSaveToasts';
import { debounce } from '@/lib/utils';
import type { SaveStatus } from '@/types';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';
import type { ProfileUpdatePayload, ProfileUpdateResponse } from '../types';

/**
 * Field being edited in inline mode
 */
export type EditingField = 'displayName' | 'username' | null;

/**
 * Options for the useProfileEditor hook
 */
export interface UseProfileEditorOptions {
  /** Debounce delay in ms for auto-save (default: 900) */
  debounceMs?: number;
}

/**
 * Return type for the useProfileEditor hook
 */
export interface UseProfileEditorReturn {
  /** Current artist object derived from profile */
  artist: Artist | null;
  /** Whether this is a music/artist profile */
  isMusicProfile: boolean;
  /** Current profile ID */
  profileId: string | undefined;
  /** Current display name value */
  profileDisplayName: string;
  /** Set display name value */
  setProfileDisplayName: React.Dispatch<React.SetStateAction<string>>;
  /** Current username value */
  profileUsername: string;
  /** Set username value */
  setProfileUsername: React.Dispatch<React.SetStateAction<string>>;
  /** Currently editing field */
  editingField: EditingField;
  /** Set editing field */
  setEditingField: React.Dispatch<React.SetStateAction<EditingField>>;
  /** Ref for display name input */
  displayNameInputRef: React.RefObject<HTMLInputElement | null>;
  /** Ref for username input */
  usernameInputRef: React.RefObject<HTMLInputElement | null>;
  /** Profile save status */
  profileSaveStatus: SaveStatus;
  /** Debounced profile save function */
  debouncedProfileSave: ReturnType<typeof debounce> & {
    flush: () => void;
    cancel: () => void;
  };
  /** Handle avatar upload */
  handleAvatarUpload: (file: File) => Promise<string>;
  /** Handle display name change */
  handleDisplayNameChange: (value: string) => void;
  /** Handle username change */
  handleUsername: (value: string) => void;
  /** Handle input key down for Enter/Escape */
  handleInputKeyDown: (
    e: React.KeyboardEvent,
    field: 'displayName' | 'username'
  ) => void;
  /** Handle input blur */
  handleInputBlur: () => void;
  /** Reference to last saved profile values */
  lastProfileSavedRef: React.RefObject<{
    displayName: string;
    username: string;
  } | null>;
}

/**
 * Custom hook for managing profile editing
 *
 * Features:
 * - Display name and username editing with debounced save
 * - Avatar upload handling
 * - Inline editing mode management
 * - Toast notifications for save status
 *
 * @example
 * ```tsx
 * const {
 *   artist,
 *   profileDisplayName,
 *   editingField,
 *   setEditingField,
 *   handleDisplayNameChange,
 *   handleAvatarUpload,
 * } = useProfileEditor();
 * ```
 */
export function useProfileEditor(
  options: UseProfileEditorOptions = {}
): UseProfileEditorReturn {
  const { debounceMs = 900 } = options;
  const router = useRouter();
  const dashboardData = useDashboardData();

  const [artist, setArtist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );

  const isMusicProfile =
    dashboardData.selectedProfile?.creatorType === 'artist';
  const profileId = dashboardData.selectedProfile?.id;

  const [profileDisplayName, setProfileDisplayName] = useState<string>(
    dashboardData.selectedProfile?.displayName ?? ''
  );
  const [profileUsername, setProfileUsername] = useState<string>(
    dashboardData.selectedProfile?.username ?? ''
  );

  const [editingField, setEditingField] = useState<EditingField>(null);
  const displayNameInputRef = useRef<HTMLInputElement | null>(null);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);

  const [profileSaveStatus, setProfileSaveStatus] = useState<SaveStatus>({
    saving: false,
    success: null,
    error: null,
    lastSaved: null,
  });

  const lastProfileSavedRef = useRef<{
    displayName: string;
    username: string;
  } | null>(null);

  // Clear success status after delay
  useEffect(() => {
    if (!profileSaveStatus.success) return;
    const timeoutId = window.setTimeout(() => {
      setProfileSaveStatus(prev => ({ ...prev, success: null }));
    }, 1500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [profileSaveStatus.success]);

  // Show toast notifications for save status
  useProfileSaveToasts(profileSaveStatus);

  // Sync state when selected profile changes
  useEffect(() => {
    if (!dashboardData.selectedProfile) {
      setArtist(null);
      setProfileDisplayName('');
      setProfileUsername('');
      setEditingField(null);
      lastProfileSavedRef.current = null;
      return;
    }

    setArtist(
      convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
    );
    setProfileDisplayName(dashboardData.selectedProfile.displayName ?? '');
    setProfileUsername(dashboardData.selectedProfile.username ?? '');

    lastProfileSavedRef.current = {
      displayName: dashboardData.selectedProfile.displayName ?? '',
      username: dashboardData.selectedProfile.username ?? '',
    };
    setProfileSaveStatus({
      saving: false,
      success: null,
      error: null,
      lastSaved: null,
    });
  }, [dashboardData.selectedProfile]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingField === 'displayName') {
      displayNameInputRef.current?.focus();
      displayNameInputRef.current?.select();
    }
    if (editingField === 'username') {
      usernameInputRef.current?.focus();
      usernameInputRef.current?.select();
    }
  }, [editingField]);

  // API call to update profile
  const updateProfile = useCallback(
    async (updates: ProfileUpdatePayload): Promise<ProfileUpdateResponse> => {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      const body = (await response.json().catch(() => null)) as
        | ProfileUpdateResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        const message =
          body && 'error' in body && typeof body.error === 'string'
            ? body.error
            : 'Failed to update profile';
        throw new Error(message);
      }

      if (!body || !('profile' in body)) {
        throw new Error('Failed to update profile');
      }

      return body;
    },
    []
  );

  // API call to upload avatar
  const uploadAvatar = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/images/upload', {
      method: 'POST',
      body: formData,
    });

    const body = (await response.json().catch(() => null)) as {
      blobUrl?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      const message = body?.error ?? 'Upload failed';
      throw new Error(message);
    }

    if (!body?.blobUrl) {
      throw new Error('Upload failed');
    }

    return body.blobUrl;
  }, []);

  // Save profile (called by debounced function)
  const saveProfile = useCallback(
    async (next: { displayName: string; username: string }): Promise<void> => {
      if (!profileId) {
        setProfileSaveStatus({
          saving: false,
          success: false,
          error: 'Missing profile id; please refresh and try again.',
          lastSaved: null,
        });
        toast.error('Missing profile id; please refresh and try again.');
        return;
      }

      const username = next.username.trim();
      const displayName = next.displayName.trim();

      if (displayName.length === 0 || username.length === 0) {
        return;
      }

      const lastSaved = lastProfileSavedRef.current;
      if (
        lastSaved?.displayName === displayName &&
        lastSaved?.username === username
      ) {
        return;
      }

      setProfileSaveStatus(prev => ({
        ...prev,
        saving: true,
        success: null,
        error: null,
      }));

      try {
        const result = await updateProfile({
          displayName,
          username,
        });

        const nextHandle = result.profile.username ?? artist?.handle;
        const nextName = result.profile.displayName ?? artist?.name;
        const nextAvatar =
          typeof result.profile.avatarUrl === 'string'
            ? result.profile.avatarUrl
            : artist?.image_url;

        if (nextHandle || nextName || nextAvatar) {
          setArtist(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              handle: nextHandle ?? prev.handle,
              name: nextName ?? prev.name,
              image_url: nextAvatar ?? prev.image_url,
            };
          });
        }

        lastProfileSavedRef.current = { displayName, username };

        setProfileSaveStatus({
          saving: false,
          success: true,
          error: null,
          lastSaved: new Date(),
        });

        if (result.warning) {
          toast.message(result.warning);
        }

        router.refresh();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update profile';
        setProfileSaveStatus({
          saving: false,
          success: false,
          error: message,
          lastSaved: null,
        });
        toast.error(message);
      }
    },
    [
      artist?.handle,
      artist?.image_url,
      artist?.name,
      profileId,
      router,
      updateProfile,
    ]
  );

  // Debounced save function
  const debouncedProfileSave = useMemo(
    () =>
      debounce(async (...args: unknown[]) => {
        const [next] = args as [{ displayName: string; username: string }];
        await saveProfile(next);
      }, debounceMs),
    [saveProfile, debounceMs]
  );

  // Cleanup debounced save on unmount
  useEffect(() => {
    return () => {
      debouncedProfileSave.flush();
    };
  }, [debouncedProfileSave]);

  // Handle avatar upload
  const handleAvatarUpload = useCallback(
    async (file: File): Promise<string> => {
      try {
        const blobUrl = await uploadAvatar(file);
        const result = await updateProfile({ avatarUrl: blobUrl });
        const nextAvatar = result.profile.avatarUrl ?? blobUrl;
        setArtist(prev => {
          if (!prev) return prev;
          return { ...prev, image_url: nextAvatar };
        });
        if (result.warning) {
          toast.message(result.warning);
        } else {
          toast.success('Profile photo updated');
        }
        router.refresh();
        return nextAvatar;
      } finally {
        // no-op
      }
    },
    [router, updateProfile, uploadAvatar]
  );

  // Handle display name change
  const handleDisplayNameChange = useCallback(
    (nextValue: string) => {
      setProfileDisplayName(nextValue);
      setProfileSaveStatus(prev => ({
        ...prev,
        success: null,
        error: null,
      }));
      debouncedProfileSave({
        displayName: nextValue,
        username: profileUsername,
      });
    },
    [debouncedProfileSave, profileUsername]
  );

  // Handle username change
  const handleUsername = useCallback(
    (rawValue: string) => {
      const nextValue = rawValue.startsWith('@') ? rawValue.slice(1) : rawValue;
      setProfileUsername(nextValue);
      setProfileSaveStatus(prev => ({
        ...prev,
        success: null,
        error: null,
      }));
      debouncedProfileSave({
        displayName: profileDisplayName,
        username: nextValue,
      });
    },
    [debouncedProfileSave, profileDisplayName]
  );

  // Handle input key down (Enter to save, Escape to cancel)
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent, field: 'displayName' | 'username') => {
      if (e.key === 'Enter') {
        debouncedProfileSave.flush();
        setEditingField(null);
      }
      if (e.key === 'Escape') {
        debouncedProfileSave.cancel();
        if (field === 'displayName') {
          setProfileDisplayName(lastProfileSavedRef.current?.displayName ?? '');
        } else {
          setProfileUsername(lastProfileSavedRef.current?.username ?? '');
        }
        setEditingField(null);
      }
    },
    [debouncedProfileSave]
  );

  // Handle input blur
  const handleInputBlur = useCallback(() => {
    debouncedProfileSave.flush();
    setEditingField(null);
  }, [debouncedProfileSave]);

  return {
    artist,
    isMusicProfile,
    profileId,
    profileDisplayName,
    setProfileDisplayName,
    profileUsername,
    setProfileUsername,
    editingField,
    setEditingField,
    displayNameInputRef,
    usernameInputRef,
    profileSaveStatus,
    debouncedProfileSave,
    handleAvatarUpload,
    handleDisplayNameChange,
    handleUsername,
    handleInputKeyDown,
    handleInputBlur,
    lastProfileSavedRef,
  };
}
