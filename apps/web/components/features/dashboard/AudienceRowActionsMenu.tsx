'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Copy, MoreHorizontal } from 'lucide-react';
import { useCallback, useState } from 'react';

import { AppIconButton } from '@/components/atoms/AppIconButton';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import type { AudienceMember } from '@/types';

interface AudienceRowActionsMenuProps {
  readonly row: AudienceMember;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /**
   * Radix menu modality. Default `true` (production behavior). Stories pass
   * `false` so the portaled open menu does not `hideOthers`-ARIA-hide the
   * canvas (axe aria-hidden-focus on the focusable trigger).
   */
  readonly modal?: boolean;
}

export function AudienceRowActionsMenu({
  row,
  open,
  onOpenChange,
  modal = true,
}: AudienceRowActionsMenuProps) {
  const notifications = useNotifications();
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyEmail = useCallback(async () => {
    if (!row.email) return;
    const success = await copyToClipboard(row.email);
    if (success) {
      setCopySuccess(true);
      notifications.success('Copied email');
      setTimeout(() => setCopySuccess(false), 1500);
      return;
    }
    notifications.error('Failed to copy email');
  }, [notifications, row.email]);

  const handleCopyPhone = useCallback(async () => {
    if (!row.phone) return;
    const success = await copyToClipboard(row.phone);
    if (success) {
      setCopySuccess(true);
      notifications.success('Copied phone number');
      setTimeout(() => setCopySuccess(false), 1500);
      return;
    }
    notifications.error('Failed to copy phone number');
  }, [notifications, row.phone]);

  const hasEmail = typeof row.email === 'string' && row.email.length > 0;
  const hasPhone = typeof row.phone === 'string' && row.phone.length > 0;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={modal}>
      <DropdownMenuTrigger asChild>
        <AppIconButton
          inert={open}
          ariaLabel='Open audience row actions'
          onClick={event => event.stopPropagation()}
          onKeyDown={event =>
            handleActivationKeyDown(event, e => e.stopPropagation())
          }
        >
          <MoreHorizontal className='h-4 w-4' />
        </AppIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        sideOffset={8}
        onClick={event => event.stopPropagation()}
        onKeyDown={event =>
          handleActivationKeyDown(event, e => e.stopPropagation())
        }
      >
        <DropdownMenuItem disabled={!hasEmail} onClick={handleCopyEmail}>
          <Copy className='h-4 w-4' />
          {copySuccess ? 'Copied!' : 'Copy email'}
        </DropdownMenuItem>

        <DropdownMenuItem disabled={!hasPhone} onClick={handleCopyPhone}>
          <Copy className='h-4 w-4' />
          Copy phone
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
