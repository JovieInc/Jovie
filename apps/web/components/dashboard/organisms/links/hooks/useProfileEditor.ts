'use client';

/**
 * useProfileEditor Hook
 *
 * Custom hook for managing profile editing state including display name,
 * username, and avatar. Uses TanStack Query for mutations and Pacer for
 * debounced auto-save.
 */

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { PACER_TIMING, useAutoSave } from '@/lib/pacer';
import {
  useAvatarMutation,
  useProfileSaveMutation,
} from '@/lib/queries/useProfileMutation';
import type { SaveStatus } from '@/types';
import { type Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

/**
 * Field being edited in inline mode
 */
export type EditingField = 'displayName' | 'username' | null;

/**
 * Options for the useProfileEditor hook
 */
export interface UseProfileEditorOptions {
  /** Debounce delay in ms for auto-save (default: 500 via PACER_TIMING.SAVE_DEBOUNCE_MS) */
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
  debouncedProfileSave: {
    flush: () => Promise<void>;
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
 * - Display name and username editing with Pacer-powered debounced save
 * - TanStack Query mutations with optimistic updates
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
  const { debounceMs = PACER_TIMING.SAVE_DEBOUNCE_MS } = options;
  const router = useRouter();
  const dashboardData = useDashboardData();

  // Profile mutation hooks
  const profileMutation = useProfileSaveMutation();
  const avatarMutation = useAvatarMutation();

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

  // Track pending save data for comparison
  const pendingDataRef = useRef<{
    displayName: string;
    username: string;
  } | null>(null);

  // Save profile using TanStack Query mutation
  const saveProfile = useCallback(
    async (data: { displayName: string; username: string }): Promise<void> => {
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

      const username = data.username?.trim() ?? '';
      const displayName = data.displayName?.trim() ?? '';

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
        const result = await profileMutation.mutateAsync({
          updates: { displayName, username },
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
      profileMutation,
      router,
    ]
  );

  // Use Pacer's useAutoSave for debounced saving
  const autoSave = useAutoSave<{ displayName: string; username: string }>({
    saveFn: saveProfile,
    wait: debounceMs,
    onSuccess: () => {
      // Success handling is done in saveProfile
    },
    onError: () => {
      // Error handling is done in saveProfile
    },
  });

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

  // Cleanup on unmount - flush pending saves
  useEffect(() => {
    return () => {
      autoSave.flush();
    };
  }, [autoSave]);

  // Handle avatar upload using TanStack Query mutation
  const handleAvatarUpload = useCallback(
    async (file: File): Promise<string> => {
      const avatarUrl = await avatarMutation.mutateAsync(file);
      setArtist(prev => (prev ? { ...prev, image_url: avatarUrl } : prev));
      toast.success('Profile photo updated');
      router.refresh();
      return avatarUrl;
    },
    [avatarMutation, router]
  );

  // Handle display name change with auto-save
  const handleDisplayNameChange = useCallback(
    (nextValue: string) => {
      setProfileDisplayName(nextValue);
      setProfileSaveStatus(prev => ({
        ...prev,
        success: null,
        error: null,
      }));
      pendingDataRef.current = {
        displayName: nextValue,
        username: profileUsername,
      };
      autoSave.save({
        displayName: nextValue,
        username: profileUsername,
      });
    },
    [autoSave, profileUsername]
  );

  // Handle username change with auto-save
  const handleUsername = useCallback(
    (rawValue: string) => {
      const nextValue = rawValue.startsWith('@') ? rawValue.slice(1) : rawValue;
      setProfileUsername(nextValue);
      setProfileSaveStatus(prev => ({
        ...prev,
        success: null,
        error: null,
      }));
      pendingDataRef.current = {
        displayName: profileDisplayName,
        username: nextValue,
      };
      autoSave.save({
        displayName: profileDisplayName,
        username: nextValue,
      });
    },
    [autoSave, profileDisplayName]
  );

  // Debounced save interface compatible with existing code
  const debouncedProfileSave = useMemo(
    () => ({
      flush: async () => {
        await autoSave.flush();
      },
      cancel: () => {
        autoSave.cancel();
      },
    }),
    [autoSave]
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
