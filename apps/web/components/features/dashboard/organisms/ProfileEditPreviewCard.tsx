'use client';

/**
 * ProfileEditPreviewCard Component
 *
 * Displays a preview of a proposed profile edit from the chat.
 * Allows the user to apply or cancel the change.
 */

import { Check, Loader2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { usePreviewPanelContext } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton } from '@/components/molecules/drawer';
import { useConfirmChatEditMutation } from '@/lib/queries';
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
  const confirmEdit = useConfirmChatEditMutation();
  const previewPanel = usePreviewPanelContext();

  const handleApply = useCallback(async () => {
    confirmEdit.mutate(
      {
        profileId,
        field: preview.field,
        newValue: preview.newValue,
      },
      {
        onSuccess: () => {
          setApplied(true);
          toast.success(`${preview.fieldLabel} updated successfully`);

          // Instantly update sidebar preview if available
          if (
            previewPanel?.previewData &&
            preview.field === 'displayName' &&
            typeof preview.newValue === 'string'
          ) {
            previewPanel.setPreviewData({
              ...previewPanel.previewData,
              displayName: preview.newValue,
            });
          }

          onApply?.();
        },
      }
    );
  }, [profileId, preview, onApply, confirmEdit, previewPanel]);

  const handleCancel = useCallback(() => {
    setCancelled(true);
    onCancel?.();
  }, [onCancel]);

  // Show completed state
  if (applied) {
    return (
      <ContentSurfaceCard className='p-3'>
        <div className='flex items-center justify-between gap-2'>
          <div className='min-w-0 space-y-0.5'>
            <p className='truncate text-[13px] font-semibold tracking-[-0.01em] text-primary-token'>
              {preview.fieldLabel}
            </p>
            <p className='text-[12px] text-secondary-token'>
              Updated successfully
            </p>
          </div>
          <span className='inline-flex shrink-0 items-center gap-1 rounded-md border border-subtle bg-surface-1 px-1.5 py-0.5 text-[11px] font-caption tracking-[-0.01em] text-success'>
            <Check className='h-3.5 w-3.5' />
            Applied
          </span>
        </div>
      </ContentSurfaceCard>
    );
  }

  // Show cancelled state
  if (cancelled) {
    return (
      <ContentSurfaceCard className='p-3 opacity-70'>
        <div className='flex items-center justify-between gap-2'>
          <div className='min-w-0 space-y-0.5'>
            <p className='truncate text-[13px] font-semibold tracking-[-0.01em] text-primary-token'>
              {preview.fieldLabel}
            </p>
            <p className='text-[12px] text-secondary-token'>Edit cancelled</p>
          </div>
          <span className='inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-0 px-1.5 py-0.5 text-[11px] font-caption tracking-[-0.01em] text-secondary-token'>
            <X className='h-3.5 w-3.5' />
            Cancelled
          </span>
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <div className='px-3 py-2'>
        <div className='space-y-0.5'>
          <h4 className='text-[13px] font-semibold tracking-[-0.01em] text-primary-token'>
            Update {preview.fieldLabel}
          </h4>
          {preview.reason && (
            <p className='text-[11px] leading-[1.45] text-secondary-token'>
              {preview.reason}
            </p>
          )}
        </div>
      </div>

      <div className='space-y-2 px-3 py-2'>
        <div className='rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 px-2.5 py-2'>
          <div className='mb-0.5 text-[13px] font-caption tracking-normal text-secondary-token'>
            Current
          </div>
          <div
            className={cn(
              'text-[13px] tracking-[-0.01em] text-primary-token',
              !preview.currentValue && 'italic text-tertiary-token'
            )}
          >
            {formatValue(preview.currentValue)}
          </div>
        </div>
        <div className='rounded-[10px] border border-accent/20 bg-accent/5 px-2.5 py-2'>
          <div className='mb-0.5 text-[13px] font-caption tracking-normal text-(--linear-accent)'>
            New
          </div>
          <div className='text-[13px] tracking-[-0.01em] text-primary-token'>
            {formatValue(preview.newValue)}
          </div>
        </div>
      </div>

      <div className='flex items-center gap-1.5 border-t border-(--linear-app-frame-seam) px-3 py-2'>
        <DrawerButton
          type='button'
          tone='primary'
          onClick={handleApply}
          disabled={confirmEdit.isPending}
          className='flex-1 justify-center gap-1.5'
        >
          {confirmEdit.isPending ? (
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
        </DrawerButton>
        <DrawerButton
          type='button'
          tone='secondary'
          onClick={handleCancel}
          disabled={confirmEdit.isPending}
          className='justify-center gap-1.5'
        >
          <X className='h-3.5 w-3.5' />
          Cancel
        </DrawerButton>
      </div>
    </ContentSurfaceCard>
  );
}
