'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@jovie/ui';
import { useState } from 'react';

import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

interface DeleteCreatorDialogProps {
  profile: AdminCreatorProfileRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<{ success: boolean; error?: string }>;
}

export function DeleteCreatorDialog({
  profile,
  open,
  onOpenChange,
  onConfirm,
}: DeleteCreatorDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null;

  const isClaimed = profile.isClaimed;
  const username = profile.username;

  const handleConfirm = async () => {
    setIsDeleting(true);
    setError(null);

    const result = await onConfirm();

    if (result.success) {
      onOpenChange(false);
    } else {
      setError(result.error ?? 'Failed to delete');
    }

    setIsDeleting(false);
  };

  const handleCancel = () => {
    setError(null);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isClaimed ? 'Delete User Account?' : 'Delete Creator Profile?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isClaimed ? (
              <>
                This will permanently delete the user account for @{username},
                including:
                <ul className='mt-2 ml-4 list-disc space-y-1'>
                  <li>User account and authentication</li>
                  <li>Creator profile</li>
                  <li>All social links and contacts</li>
                  <li>Analytics and click data</li>
                  <li>Notification subscriptions</li>
                </ul>
                <p className='mt-3 font-semibold'>
                  This action cannot be undone.
                </p>
              </>
            ) : (
              <>
                This will permanently delete @{username}&apos;s profile and all
                associated data including:
                <ul className='mt-2 ml-4 list-disc space-y-1'>
                  <li>Social links and contacts</li>
                  <li>Analytics and click data</li>
                  <li>Notification subscriptions</li>
                </ul>
                <p className='mt-3 font-semibold'>
                  This action cannot be undone.
                </p>
              </>
            )}
            {error && (
              <p className='mt-3 text-sm text-destructive font-semibold'>
                Error: {error}
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting
              ? 'Deleting...'
              : isClaimed
                ? 'Delete User & Profile'
                : 'Delete Profile'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
