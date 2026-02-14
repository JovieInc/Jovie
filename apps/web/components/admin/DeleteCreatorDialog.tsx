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

import { Icon } from '@/components/atoms/Icon';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';

interface DeleteCreatorDialogProps
  extends Readonly<{
    readonly profile: AdminCreatorProfileRow | null;
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly onConfirm: () => Promise<{ success: boolean; error?: string }>;
  }> {}

export function DeleteCreatorDialog({
  profile,
  open,
  onOpenChange,
  onConfirm,
}: Readonly<DeleteCreatorDialogProps>) {
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

  const items = isClaimed
    ? [
        'User account and authentication',
        'Creator profile',
        'All social links and contacts',
        'Analytics and click data',
        'Notification subscriptions',
      ]
    : [
        'Social links and contacts',
        'Analytics and click data',
        'Notification subscriptions',
      ];

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className='max-w-md'>
        <AlertDialogHeader className='gap-4'>
          {/* Danger icon */}
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10'>
            <Icon name='AlertTriangle' className='h-6 w-6 text-destructive' />
          </div>

          <div className='space-y-2 text-center'>
            <AlertDialogTitle className='text-base font-semibold text-primary-token'>
              {isClaimed ? 'Delete User Account' : 'Delete Creator Profile'}
            </AlertDialogTitle>
            <AlertDialogDescription className='text-sm text-secondary-token'>
              {isClaimed
                ? `This will permanently delete the user account for `
                : `This will permanently delete `}
              <span className='font-medium text-primary-token'>
                @{username}
              </span>
              {isClaimed ? '.' : "'s profile."}
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>

        {/* Items list */}
        <div className='rounded-lg border border-subtle bg-surface-2/50 p-4'>
          <p className='mb-3 text-xs font-medium uppercase tracking-wider text-tertiary-token'>
            Data to be deleted
          </p>
          <ul className='space-y-2'>
            {items.map(item => (
              <li key={item} className='flex items-center gap-2 text-sm'>
                <Icon name='X' className='h-3.5 w-3.5 text-destructive/70' />
                <span className='text-secondary-token'>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Warning banner */}
        <div className='flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2'>
          <Icon
            name='AlertCircle'
            className='h-3.5 w-3.5 text-destructive shrink-0'
          />
          <p className='text-xs font-medium text-destructive'>
            This action cannot be undone
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className='flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2'>
            <Icon
              name='XCircle'
              className='h-3.5 w-3.5 text-destructive shrink-0'
            />
            <p className='text-xs font-medium text-destructive'>{error}</p>
          </div>
        )}

        <AlertDialogFooter className='gap-2 sm:gap-2'>
          <AlertDialogCancel
            onClick={handleCancel}
            disabled={isDeleting}
            className='flex-1 sm:flex-none'
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            onClick={handleConfirm}
            disabled={isDeleting}
            className='flex-1 sm:flex-none'
          >
            {isDeleting ? (
              <>
                <Icon
                  name='Loader2'
                  className='mr-2 h-3.5 w-3.5 animate-spin'
                />
                Deleting...
              </>
            ) : (
              <>
                <Icon name='Trash2' className='mr-2 h-3.5 w-3.5' />
                {isClaimed ? 'Delete Account' : 'Delete Profile'}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
