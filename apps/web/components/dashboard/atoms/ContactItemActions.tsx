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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
        onClick={() => setShowDeleteConfirm(true)}
        disabled={isSaving}
        className='min-h-[44px] px-4'
      >
        Delete
      </Button>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title='Delete contact'
        description='This contact will be permanently removed from your profile. This action cannot be undone.'
        confirmLabel='Delete'
        variant='destructive'
        onConfirm={onDelete}
      />
    </div>
  );
}
