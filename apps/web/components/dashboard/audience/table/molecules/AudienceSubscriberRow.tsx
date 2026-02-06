'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import {
  AudienceCountryCell,
  AudienceCreatedAtCell,
  AudienceRowSelectionCell,
} from '../atoms';

export interface AudienceSubscriberRowProps {
  readonly row: AudienceMember;
  readonly rowNumber: number;
  readonly isSelected: boolean;
  readonly isChecked: boolean;
  readonly isMenuOpen: boolean;
  readonly virtualRowStart?: number;
  readonly measureRef?: (node: HTMLTableRowElement | null) => void;
  readonly dataIndex?: number;
  readonly onRowClick: () => void;
  readonly onRowContextMenu: (event: React.MouseEvent) => void;
  readonly onToggleSelect: () => void;
  readonly onMenuOpenChange: (open: boolean) => void;
}

export function AudienceSubscriberRow({
  row,
  rowNumber,
  isSelected,
  isChecked,
  isMenuOpen,
  virtualRowStart,
  measureRef,
  dataIndex,
  onRowClick,
  onRowContextMenu,
  onToggleSelect,
  onMenuOpenChange,
}: AudienceSubscriberRowProps) {
  const isVirtual = virtualRowStart !== undefined;

  return (
    <tr
      data-index={dataIndex}
      ref={measureRef}
      className={cn(
        'group cursor-pointer border-b border-subtle transition-colors duration-200 last:border-b-0 hover:bg-surface-2/50 focus-visible:outline-none focus-visible:bg-surface-2/50',
        isSelected && 'bg-surface-2/70'
      )}
      style={
        isVirtual
          ? {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRowStart}px)`,
            }
          : undefined
      }
      onClick={onRowClick}
      onContextMenu={onRowContextMenu}
    >
      <AudienceRowSelectionCell
        rowNumber={rowNumber}
        isChecked={isChecked}
        displayName={row.displayName}
        onToggle={onToggleSelect}
      />

      <td className='px-4 py-3 align-middle text-sm text-primary-token'>
        {row.displayName && row.displayName !== row.phone
          ? row.displayName
          : 'Subscriber'}
      </td>

      <td className='px-4 py-3 align-middle text-sm text-primary-token'>
        {row.phone ?? '—'}
      </td>

      <AudienceCountryCell geoCountry={row.geoCountry} />

      <AudienceCreatedAtCell
        row={row}
        lastSeenAt={row.lastSeenAt}
        isMenuOpen={isMenuOpen}
        onMenuOpenChange={onMenuOpenChange}
      />
    </tr>
  );
}
