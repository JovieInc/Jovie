'use client';

import { Button } from '@jovie/ui';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';

export interface ContactItemActionsProps {
  readonly isSaving?: boolean;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly onDelete: () => void;
}

export function ContactItemActions({
  isSaving = false,
  onSave,
  onCancel,
  onDelete,
}: ContactItemActionsProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <div className='flex flex-wrap gap-2 sm:gap-3'>
      <Button
        size='sm'
        onClick={onSave}
        disabled={isSaving}
        className='min-h-[44px] px-4'
      >
        {isSaving ? 'Saving…' : 'Save'}
      </Button>
      <Button
        size='sm'
        variant='secondary'
        onClick={onCancel}
        disabled={isSaving}
        className='min-h-[44px] px-4'
      >
        Cancel
      </Button>
      <Button
        size='sm'
        variant='ghost'
        onClick={() => setDeleteDialogOpen(true)}
        disabled={isSaving}
        className='min-h-[44px] px-4'
      >
        Delete
      </Button>
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title='Delete contact?'
        description='This action cannot be undone. The contact will be permanently removed from your profile.'
        confirmLabel='Delete'
        variant='destructive'
        onConfirm={onDelete}
      />
    </div>
  );
}
