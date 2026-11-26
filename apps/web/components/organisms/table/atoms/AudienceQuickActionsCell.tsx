'use client';

import { Download, ShieldBan } from 'lucide-react';
import { TableRowActionBar } from '../molecules/TableRowActionBar';

export interface AudienceQuickActionsCellProps {
  readonly onExport: () => void;
  readonly onBlock: () => void;
  readonly className?: string;
}

export function AudienceQuickActionsCell({
  onExport,
  onBlock,
  className,
}: AudienceQuickActionsCellProps) {
  return (
    <TableRowActionBar
      className={className}
      visibility='hover'
      overflowAriaLabel='Audience member actions'
      // Both verbs fit the shared primary capacity — no overflow strip.
      maxPrimary={2}
      actions={[
        {
          id: 'export',
          label: 'Export Contact',
          icon: Download,
          priority: 10,
          placement: 'primary',
          onClick: onExport,
        },
        {
          id: 'block',
          label: 'Block Member',
          icon: ShieldBan,
          priority: 20,
          placement: 'primary',
          variant: 'destructive',
          onClick: onBlock,
        },
      ]}
    />
  );
}
