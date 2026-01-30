'use client';

import { Button } from '@jovie/ui';

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
        onClick={onDelete}
        disabled={isSaving}
        className='min-h-[44px] px-4'
      >
        Delete
      </Button>
    </div>
  );
}
