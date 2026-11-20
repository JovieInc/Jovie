'use client';

import { IconButton, SimpleTooltip } from '@jovie/ui';
import { Check, CheckCircle2, CircleSlash, Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { BASE_URL } from '@/constants/app';

export interface InvestorLinkRowActionsLink {
  readonly id: string;
  readonly token: string;
  readonly isActive: boolean;
}

export function InvestorLinkRowActions({
  link,
  onToggleActive,
  onRequestDelete,
}: {
  readonly link: InvestorLinkRowActionsLink;
  readonly onToggleActive: (id: string, isActive: boolean) => void;
  readonly onRequestDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const shareableUrl = `${BASE_URL}/investor-portal?t=${link.token}`;
  const actionItems = [
    {
      id: link.isActive ? 'deactivate' : 'reactivate',
      label: link.isActive ? 'Deactivate' : 'Reactivate',
      icon: link.isActive ? CircleSlash : CheckCircle2,
      onClick: () => onToggleActive(link.id, !link.isActive),
    },
    { id: 'separator', label: '' },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      variant: 'destructive' as const,
      onClick: onRequestDelete,
    },
  ];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for HTTP contexts
    }
  };

  return (
    <div className='flex items-center gap-2'>
      <SimpleTooltip content='Copy shareable URL'>
        <IconButton
          variant='secondary'
          size='lg'
          ariaLabel='Copy shareable URL'
          onClick={event => {
            event.stopPropagation();
            void handleCopy();
          }}
        >
          {copied ? (
            <Check className='h-3.5 w-3.5 text-success' />
          ) : (
            <Copy className='h-3.5 w-3.5' />
          )}
        </IconButton>
      </SimpleTooltip>
      <TableActionMenu items={actionItems} align='end' />
    </div>
  );
}
