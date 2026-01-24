'use client';

/**
 * Dialog State Hook
 *
 * Manages open/close state for delete and invite dialogs.
 */

import { useCallback, useState } from 'react';
import type { AdminCreatorProfileRow } from '../types';

export type ProfileWithActions = AdminCreatorProfileRow & {
  isFeatured: boolean;
  marketingOptOut: boolean;
};

export interface DialogState {
  deleteDialogOpen: boolean;
  profileToDelete: ProfileWithActions | null;
  inviteDialogOpen: boolean;
  profileToInvite: ProfileWithActions | null;
}

export interface DialogActions {
  openDeleteDialog: (profile: ProfileWithActions) => void;
  closeDeleteDialog: () => void;
  openInviteDialog: (profile: ProfileWithActions) => void;
  closeInviteDialog: () => void;
  clearDeleteProfile: () => void;
  clearInviteProfile: () => void;
}

export function useDialogState(): DialogState & DialogActions {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] =
    useState<ProfileWithActions | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [profileToInvite, setProfileToInvite] =
    useState<ProfileWithActions | null>(null);

  const openDeleteDialog = useCallback((profile: ProfileWithActions) => {
    setProfileToDelete(profile);
    setDeleteDialogOpen(true);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
  }, []);

  const openInviteDialog = useCallback((profile: ProfileWithActions) => {
    setProfileToInvite(profile);
    setInviteDialogOpen(true);
  }, []);

  const closeInviteDialog = useCallback(() => {
    setInviteDialogOpen(false);
  }, []);

  const clearDeleteProfile = useCallback(() => {
    setProfileToDelete(null);
  }, []);

  const clearInviteProfile = useCallback(() => {
    setProfileToInvite(null);
  }, []);

  return {
    deleteDialogOpen,
    profileToDelete,
    inviteDialogOpen,
    profileToInvite,
    openDeleteDialog,
    closeDeleteDialog,
    openInviteDialog,
    closeInviteDialog,
    clearDeleteProfile,
    clearInviteProfile,
  };
}
