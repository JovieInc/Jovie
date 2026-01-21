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
import { Icon } from '@/components/atoms/Icon';

interface BulkDeleteCreatorDialogProps {
  open: boolean;
  count: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function BulkDeleteCreatorDialog({
  open,
  count,
  onOpenChange,
  onConfirm,
}: BulkDeleteCreatorDialogProps) {
  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className='max-w-md'>
        <AlertDialogHeader className='gap-4'>
          <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10'>
            <Icon name='AlertTriangle' className='h-6 w-6 text-red-500' />
          </div>

          <div className='space-y-2 text-center'>
            <AlertDialogTitle className='text-base font-semibold text-primary-token'>
              Delete {count} creator{count === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription className='text-sm text-secondary-token'>
              This will permanently delete the selected creator profile
              {count === 1 ? '' : 's'}. This action cannot be undone.
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>

        <div className='flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2'>
          <Icon name='AlertCircle' className='h-4 w-4 text-red-500 shrink-0' />
          <p className='text-xs font-medium text-red-500'>
            This action cannot be undone
          </p>
        </div>

        <AlertDialogFooter className='gap-2 sm:gap-2'>
          <AlertDialogCancel
            onClick={handleCancel}
            className='flex-1 sm:flex-none'
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant='destructive'
            onClick={onConfirm}
            className='flex-1 sm:flex-none'
          >
            <Icon name='Trash2' className='mr-2 h-4 w-4' />
            Delete {count === 1 ? 'Profile' : 'Profiles'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
