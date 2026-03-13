'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import {
  AudienceActionsCell,
  AudienceDeviceCell,
  AudienceLastSeenCell,
  AudienceLocationCell,
  AudienceLtvCell,
  AudienceRowSelectionCell,
  AudienceTypeBadge,
  AudienceUserCell,
  AudienceVisitsCell,
} from '../atoms';

export interface AudienceMemberRowProps {
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
        'group cursor-pointer border-b border-(--linear-border-subtle) transition-[background-color,border-color] duration-150 last:border-b-0 hover:bg-(--linear-bg-surface-1) focus-visible:outline-none focus-visible:bg-(--linear-bg-surface-1)',
        isSelected && 'bg-(--linear-bg-surface-1)'
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
        deviceType={row.deviceType}
        geoCity={row.geoCity}
        geoCountry={row.geoCountry}
      />

      <AudienceTypeBadge type={row.type} />

      <AudienceLocationCell locationLabel={row.locationLabel} />

      <AudienceDeviceCell deviceType={row.deviceType} />

      <AudienceVisitsCell visits={row.visits} intentLevel={row.intentLevel} />

      <AudienceActionsCell rowId={row.id} actions={row.latestActions} />

      <td className='px-4 py-3'>
        <AudienceLtvCell
          tipAmountTotalCents={row.tipAmountTotalCents}
          tipCount={row.tipCount}
          visits={row.visits}
          engagementScore={row.engagementScore}
          streamingClicks={row.ltvStreamingClicks ?? 0}
          tipClickValueCents={row.ltvTipClickValueCents ?? 0}
          merchSalesCents={row.ltvMerchSalesCents ?? 0}
          ticketSalesCents={row.ltvTicketSalesCents ?? 0}
        />
      </td>

      <AudienceLastSeenCell
        row={row}
        lastSeenAt={row.lastSeenAt}
        isMenuOpen={isMenuOpen}
        onMenuOpenChange={onMenuOpenChange}
      />
    </tr>
  );
}
