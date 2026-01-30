'use client';

/**
 * MultiLinkPasteDialog Component
 *
 * Shows extracted links from pasted text and allows users to select
 * which ones to add. Displays duplicate warnings for links that already exist.
 */

import { Button } from '@jovie/ui';

import { Icon } from '@/components/atoms/Icon';
import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { cn } from '@/lib/utils';
import { isBrandDark } from '@/lib/utils/color';

import type { ExtractedLinkInfo } from './useMultiLinkPaste';

export interface MultiLinkPasteDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly extractedLinks: ExtractedLinkInfo[];
  readonly onToggleSelection: (index: number) => void;
  readonly selectableCount: number;
}

/**
 * Get button styling based on selection state.
 */
function getButtonStyles(isDisabled: boolean, isChecked: boolean): string {
  if (isDisabled) {
    return 'cursor-not-allowed border-subtle bg-surface-1 opacity-60';
  }
  if (isChecked) {
    return 'border-accent bg-accent/5';
  }
  return 'border-subtle bg-surface-2 hover:border-accent/50';
}

/**
 * Get checkbox styling based on selection state.
 */
function getCheckboxStyles(isDisabled: boolean, isChecked: boolean): string {
  if (isDisabled) {
    return 'border-subtle bg-surface-3';
  }
  if (isChecked) {
    return 'border-accent bg-accent';
  }
  return 'border-subtle bg-surface-1';
}

/**
 * A single link item in the review list.
 */
function LinkItem({
  info,
  onToggle,
}: {
  readonly info: ExtractedLinkInfo;
  readonly onToggle: () => void;
}) {
  const { detectedLink, isDuplicate, isSelected } = info;
  const { platform, normalizedUrl } = detectedLink;

  const iconMeta = getPlatformIcon(platform.icon);
  const iconHex = iconMeta?.hex ? `#${iconMeta.hex}` : '#6b7280';
  const isDark = isBrandDark(iconHex);

  const isDisabled = isDuplicate;
  const isChecked = isSelected && !isDuplicate;

  return (
    <button
      type='button'
      onClick={onToggle}
      disabled={isDisabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition',
        getButtonStyles(isDisabled, isChecked)
      )}
    >
      {/* Checkbox */}
      <div
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition',
          getCheckboxStyles(isDisabled, isChecked)
        )}
      >
        {isChecked && <Icon name='Check' className='h-3 w-3 text-white' />}
      </div>

      {/* Platform icon */}
      <span
        className='flex h-6 w-6 shrink-0 items-center justify-center rounded'
        style={{
          backgroundColor: iconHex,
          color: isDark ? '#ffffff' : '#0f172a',
        }}
      >
        <SocialIcon platform={platform.icon} className='h-3.5 w-3.5' />
      </span>

      {/* URL and info */}
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='text-sm font-medium text-primary-token'>
            {platform.name}
          </span>
          {isDuplicate && (
            <span className='flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400'>
              <Icon name='AlertTriangle' className='h-3 w-3' />
              Already added
            </span>
          )}
        </div>
        <p className='truncate text-xs text-tertiary-token'>{normalizedUrl}</p>
      </div>
    </button>
  );
}

export function MultiLinkPasteDialog({
  open,
  onClose,
  onConfirm,
  extractedLinks,
  onToggleSelection,
  selectableCount,
}: MultiLinkPasteDialogProps) {
  const hasSelectableLinks = selectableCount > 0;
  const totalLinks = extractedLinks.length;
  const duplicateCount = extractedLinks.filter(l => l.isDuplicate).length;

  return (
    <Dialog open={open} onClose={onClose} size='md'>
      <DialogTitle className='flex items-center gap-3'>
        <div className='flex h-8 w-8 items-center justify-center rounded-full bg-accent/10'>
          <Icon name='Link' className='h-4 w-4 text-accent' />
        </div>
        <span>
          Found {totalLinks} link{totalLinks === 1 ? '' : 's'}
        </span>
      </DialogTitle>

      <DialogDescription>
        Select which links you'd like to add to your profile.
        {duplicateCount > 0 && (
          <span className='text-amber-600 dark:text-amber-400'>
            {' '}
            {duplicateCount} already added.
          </span>
        )}
      </DialogDescription>

      <DialogBody className='max-h-[50vh] space-y-2 overflow-y-auto'>
        {extractedLinks.map((info, index) => (
          <LinkItem
            key={`${info.detectedLink.normalizedUrl}-${index}`}
            info={info}
            onToggle={() => onToggleSelection(index)}
          />
        ))}
      </DialogBody>

      <DialogActions>
        <Button variant='secondary' size='sm' onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant='primary'
          size='sm'
          onClick={onConfirm}
          disabled={!hasSelectableLinks}
        >
          Add {selectableCount} link{selectableCount === 1 ? '' : 's'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
