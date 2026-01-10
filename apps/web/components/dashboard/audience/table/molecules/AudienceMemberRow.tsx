'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import {
  AudienceActionsCell,
  AudienceDeviceCell,
  AudienceLastSeenCell,
  AudienceLocationCell,
  AudienceRowSelectionCell,
  AudienceTypeBadge,
  AudienceUserCell,
  AudienceVisitsCell,
} from '../atoms';

export interface AudienceMemberRowProps {
  row: AudienceMember;
  rowNumber: number;
  isSelected: boolean;
  isChecked: boolean;
  isMenuOpen: boolean;
  virtualRowStart?: number;
  measureRef?: (node: HTMLTableRowElement | null) => void;
  dataIndex?: number;
  onRowClick: () => void;
  onRowContextMenu: (event: React.MouseEvent) => void;
  onToggleSelect: () => void;
  onMenuOpenChange: (open: boolean) => void;
}

export function AudienceMemberRow({
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
}: AudienceMemberRowProps) {
  const isVirtual = virtualRowStart !== undefined;

  return (
    <tr
      data-index={dataIndex}
      ref={measureRef}
      className={cn(
        'group cursor-pointer border-b border-subtle transition-colors duration-200 last:border-b-0 hover:bg-surface-2 focus:outline-none',
        isSelected && 'bg-surface-2'
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

      <AudienceUserCell
        displayName={row.displayName}
        type={row.type}
        email={row.email}
        phone={row.phone}
      />

      <AudienceTypeBadge type={row.type} />

      <AudienceLocationCell locationLabel={row.locationLabel} />

      <AudienceDeviceCell deviceType={row.deviceType} />

      <AudienceVisitsCell visits={row.visits} intentLevel={row.intentLevel} />

      <AudienceActionsCell rowId={row.id} actions={row.latestActions} />

      <AudienceLastSeenCell
        row={row}
        lastSeenAt={row.lastSeenAt}
        isMenuOpen={isMenuOpen}
        onMenuOpenChange={onMenuOpenChange}
      />
    </tr>
  );
}
