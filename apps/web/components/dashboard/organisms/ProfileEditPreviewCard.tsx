'use client';

/**
 * ProfileEditPreviewCard Component
 *
 * Displays a preview of a proposed profile edit from the chat.
 * Allows the user to apply or cancel the change.
 */

import { Button } from '@jovie/ui';
import { Check, Loader2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useConfirmProfileEditMutation } from '@/lib/queries/useChatMutations';
import { cn } from '@/lib/utils';

export interface ProfileEditPreview {
  field: 'displayName' | 'bio' | 'genres';
  fieldLabel: string;
  currentValue: string | string[] | null;
  newValue: string | string[];
  reason?: string;
}

interface ProfileEditPreviewCardProps {
  readonly preview: ProfileEditPreview;
  readonly onApply?: () => void;
  readonly onCancel?: () => void;
  readonly profileId: string;
}

function formatValue(value: string | string[] | null): string {
  if (value === null || value === undefined) {
    return 'Not set';
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'None';
  }
  return value || 'Not set';
}

export function ProfileEditPreviewCard({
  preview,
  onApply,
  onCancel,
  profileId,
}: ProfileEditPreviewCardProps) {
  const [applied, setApplied] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  const { mutate: confirmEdit, isPending: isApplying } =
    useConfirmProfileEditMutation();

  const handleApply = useCallback(() => {
    confirmEdit(
      {
        profileId,
        field: preview.field,
        newValue: preview.newValue,
      },
      {
        onSuccess: () => {
          setApplied(true);
          toast.success(`${preview.fieldLabel} updated successfully`);
          onApply?.();
        },
        onError: (error: Error) => {
          toast.error(error.message || 'Failed to apply edit');
        },
      }
    );
  }, [profileId, preview, onApply, confirmEdit]);

  const handleCancel = useCallback(() => {
    setCancelled(true);
    onCancel?.();
  }, [onCancel]);

  // Show completed state
  if (applied) {
    return (
      <div className='rounded-xl border border-success/30 bg-success-subtle p-4'>
        <div className='flex items-center gap-2 text-success'>
          <Check className='h-4 w-4' />
          <span className='text-sm font-medium'>
            {preview.fieldLabel} updated
          </span>
        </div>
      </div>
    );
  }

  // Show cancelled state
  if (cancelled) {
    return (
      <div className='rounded-xl border border-subtle bg-surface-1 p-4 opacity-60'>
        <div className='flex items-center gap-2 text-secondary-token'>
          <X className='h-4 w-4' />
          <span className='text-sm'>Edit cancelled</span>
        </div>
      </div>
    );
  }

  return (
    <div className='rounded-xl border border-accent/30 bg-accent/5 p-4'>
      {/* Header */}
      <div className='mb-3 flex items-start justify-between'>
        <div>
          <h4 className='text-sm font-medium text-primary-token'>
            Update {preview.fieldLabel}
          </h4>
          {preview.reason && (
            <p className='mt-0.5 text-xs text-secondary-token'>
              {preview.reason}
            </p>
          )}
        </div>
      </div>

      {/* Diff view */}
      <div className='mb-4 space-y-2'>
        <div className='rounded-lg bg-surface-1 p-3'>
          <div className='mb-1 text-xs font-medium text-tertiary-token'>
            Current
          </div>
          <div
            className={cn(
              'text-sm',
              !preview.currentValue && 'italic text-tertiary-token'
            )}
          >
            {formatValue(preview.currentValue)}
          </div>
        </div>
        <div className='rounded-lg border border-accent/20 bg-accent/10 p-3'>
          <div className='mb-1 text-xs font-medium text-accent'>New</div>
          <div className='text-sm text-primary-token'>
            {formatValue(preview.newValue)}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className='flex gap-2'>
        <Button
          type='button'
          variant='primary'
          size='sm'
          onClick={handleApply}
          disabled={isApplying}
          className='flex-1 gap-1.5'
        >
          {isApplying ? (
            <>
              <Loader2 className='h-3.5 w-3.5 animate-spin' />
              Applying...
            </>
          ) : (
            <>
              <Check className='h-3.5 w-3.5' />
              Apply
            </>
          )}
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={handleCancel}
          disabled={isApplying}
          className='gap-1.5'
        >
          <X className='h-3.5 w-3.5' />
          Cancel
        </Button>
      </div>
    </div>
  );
}
