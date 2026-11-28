'use client';

import { Check, CheckCircle2, CircleSlash, Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TableRowActionBar } from '@/components/organisms/table';
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
    <TableRowActionBar
      overflowAriaLabel='Investor link actions'
      actions={[
        {
          id: 'copy',
          label: 'Copy Shareable URL',
          icon: copied ? Check : Copy,
          priority: 10,
          placement: 'primary',
          isActive: copied,
          onClick: () => {
            void handleCopy();
          },
        },
        {
          id: link.isActive ? 'deactivate' : 'reactivate',
          label: link.isActive ? 'Deactivate' : 'Reactivate',
          icon: link.isActive ? CircleSlash : CheckCircle2,
          priority: 20,
          onClick: () => onToggleActive(link.id, !link.isActive),
        },
        {
          id: 'delete',
          label: 'Delete',
          icon: Trash2,
          variant: 'destructive',
          onClick: onRequestDelete,
        },
      ]}
    />
  );
}
