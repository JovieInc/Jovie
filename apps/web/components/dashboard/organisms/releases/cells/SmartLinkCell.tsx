'use client';

import { memo, useCallback } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/atoms/Icon';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface SmartLinkCellProps {
  readonly release: ReleaseViewModel;
  /** When true, shows a locked state instead of the copyable link */
  readonly locked?: boolean;
  /** Reason the smartlink is locked — determines icon and label */
  readonly lockReason?: 'scheduled' | 'cap' | null;
}

export const SmartLinkCell = memo(function SmartLinkCell({
  release,
  locked = false,
  lockReason,
}: SmartLinkCellProps) {
  const smartLinkUrl = `${getBaseUrl()}${release.smartLinkPath}`;

  const handleCopySuccess = useCallback(() => {
    toast.success(`${release.title} smart link copied`, {
      id: `smart-link-copy-${release.id}`,
    });
  }, [release.title, release.id]);

  if (locked) {
    const isScheduled = lockReason === 'scheduled';
    return (
      <div
        className={cn(
          'flex h-[28px] items-center gap-1.5 rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) px-3',
          'text-[12px] font-[450] tracking-[-0.01em] text-(--linear-text-tertiary) select-none transition-[background-color,border-color,color] duration-150'
        )}
        title={
          isScheduled
            ? 'Smart link goes live on release day. Upgrade to Pro for pre-release pages.'
            : 'Upgrade to Pro to unlock this smart link'
        }
        data-testid={`smart-link-locked-${release.id}`}
      >
        <Icon
          name={isScheduled ? 'Clock' : 'Lock'}
          className='h-3 w-3 shrink-0'
          aria-hidden='true'
        />
        <span className='truncate'>
          {isScheduled ? 'Scheduled' : 'Smart link (Pro)'}
        </span>
      </div>
    );
  }

  return (
    <CopyableUrlRow
      url={smartLinkUrl}
      displayValue={release.smartLinkPath}
      size='sm'
      className='w-full min-w-0 max-w-[172px] md:max-w-[188px] lg:max-w-[216px] xl:max-w-[246px]'
      onCopySuccess={handleCopySuccess}
      copyButtonTitle='Copy smart link'
      openButtonTitle='Open smart link'
    />
  );
});
