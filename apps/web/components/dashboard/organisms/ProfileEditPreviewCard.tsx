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
      <ContentSurfaceCard className='p-4'>
        <div className='flex items-center justify-between gap-3'>
          <div className='min-w-0 space-y-1'>
            <p className='truncate text-[13px] font-[560] tracking-[-0.01em] text-(--linear-text-primary)'>
              {preview.fieldLabel}
            </p>
            <p className='text-[12px] text-(--linear-text-secondary)'>
              Updated successfully
            </p>
          </div>
          <span className='inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-success/20 bg-success-subtle px-2 py-1 text-[11px] font-[510] tracking-[-0.01em] text-success'>
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
      <ContentSurfaceCard className='p-4 opacity-70'>
        <div className='flex items-center justify-between gap-3'>
          <div className='min-w-0 space-y-1'>
            <p className='truncate text-[13px] font-[560] tracking-[-0.01em] text-(--linear-text-primary)'>
              {preview.fieldLabel}
            </p>
            <p className='text-[12px] text-(--linear-text-secondary)'>
              Edit cancelled
            </p>
          </div>
          <span className='inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-2 py-1 text-[11px] font-[510] tracking-[-0.01em] text-(--linear-text-secondary)'>
            <X className='h-3.5 w-3.5' />
            Cancelled
          </span>
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <div className='border-b border-(--linear-border-subtle) px-4 py-3'>
        <div className='space-y-0.5'>
          <h4 className='text-[13px] font-[560] tracking-[-0.01em] text-(--linear-text-primary)'>
            Update {preview.fieldLabel}
          </h4>
          {preview.reason && (
            <p className='text-[11px] leading-[1.45] text-(--linear-text-secondary)'>
              {preview.reason}
            </p>
          )}
        </div>
      </div>

      <div className='space-y-2 px-4 py-3'>
        <div className='rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-3 py-3'>
          <div className='mb-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
            Current
          </div>
          <div
            className={cn(
              'text-[13px] tracking-[-0.01em] text-(--linear-text-primary)',
              !preview.currentValue && 'italic text-(--linear-text-tertiary)'
            )}
          >
            {formatValue(preview.currentValue)}
          </div>
        </div>
        <div className='rounded-[10px] border border-(--linear-accent)/20 bg-(--linear-accent)/8 px-3 py-3'>
          <div className='mb-1 text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-accent)'>
            New
          </div>
          <div className='text-[13px] tracking-[-0.01em] text-(--linear-text-primary)'>
            {formatValue(preview.newValue)}
          </div>
        </div>
      </div>

      <div className='flex items-center gap-2 border-t border-(--linear-border-subtle) px-4 py-3'>
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
