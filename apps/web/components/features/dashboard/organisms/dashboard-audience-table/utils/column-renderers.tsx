'use client';

import type { CellContext } from '@tanstack/react-table';
import { Bell, Eye } from 'lucide-react';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import {
  AudienceActionsCell,
  AudienceDeviceCell,
  AudienceEngagementCell,
  AudienceIdentificationIndicator,
  AudienceIntentScoreCell,
  AudienceLastActionCell,
  AudienceLastSeenCell,
  AudienceLocationCell,
  AudienceLtvCell,
  AudienceQuickActionsCell,
  AudienceReturningCell,
  AudienceRowSelectionCell,
  AudienceSourceCell,
  AudienceTouringBadge,
  AudienceTypeBadge,
  AudienceUserCell,
  AudienceVisitsCell,
  convertContextMenuItems,
} from '@/components/organisms/table';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/audience';
import type { AudienceMember, AudienceMemberType } from '@/types';
import {
  useAudienceTableStableContext,
  useAudienceTableVolatileContext,
} from '../AudienceTableContext';

/**
 * Renders the user cell with display name, type, email, and phone
 */
export function renderUserCell({
  row,
}: CellContext<AudienceMember, string | null>) {
  return (
    <AudienceUserCell
      displayName={row.original.displayName}
      type={row.original.type}
      tags={row.original.tags}
      deviceType={row.original.deviceType}
      geoCity={row.original.geoCity}
      geoCountry={row.original.geoCountry}
    />
  );
}

/**
 * Renders the type badge cell
 */
export function renderTypeCell({
  getValue,
}: CellContext<AudienceMember, AudienceMember['type']>) {
  return <AudienceTypeBadge type={getValue()} />;
}

/**
 * Renders the location cell
 */
export function renderLocationCell({
  getValue,
}: CellContext<AudienceMember, string | null>) {
  return <AudienceLocationCell locationLabel={getValue()} />;
}

/**
 * Renders the device type cell
 */
export function renderDeviceCell({
  getValue,
}: CellContext<AudienceMember, AudienceMember['deviceType']>) {
  return <AudienceDeviceCell deviceType={getValue()} />;
}

/**
 * Renders the visits cell with intent level
 */
export function renderVisitsCell({ row }: CellContext<AudienceMember, number>) {
  return (
    <AudienceVisitsCell
      visits={row.original.visits}
      intentLevel={row.original.intentLevel}
    />
  );
}

/**
 * Renders the actions cell
 */
export function renderActionsCell({
  row,
}: CellContext<AudienceMember, AudienceMember['latestActions']>) {
  return (
    <AudienceActionsCell
      rowId={row.original.id}
      actions={row.original.latestActions}
    />
  );
}

/**
 * Renders the intent score cell with colored dot indicator
 */
export function renderIntentScoreCell({
  row,
}: CellContext<AudienceMember, AudienceMember['intentLevel']>) {
  return <AudienceIntentScoreCell intentLevel={row.original.intentLevel} />;
}

/**
 * Renders the returning badge cell (Yes/No based on visit count)
 */
export function renderReturningCell({
  row,
}: CellContext<AudienceMember, number>) {
  return <AudienceReturningCell visits={row.original.visits} />;
}

/**
 * Renders the source cell (UTM / Referrer)
 */
export function renderSourceCell({
  row,
}: CellContext<AudienceMember, AudienceMember['referrerHistory']>) {
  return (
    <AudienceSourceCell
      referrerHistory={row.original.referrerHistory}
      utmParams={row.original.utmParams}
      actions={row.original.latestActions}
    />
  );
}

/**
 * Renders tightly grouped icon indicators for platform/engagement signals.
 */
export function renderPlatformsCell({
  row,
}: CellContext<AudienceMember, unknown>) {
  return (
    <div className='flex items-center justify-center'>
      <div className='inline-flex items-center gap-1'>
        <AudienceIntentScoreCell
          intentLevel={row.original.intentLevel}
          className='w-4'
        />
        <AudienceReturningCell visits={row.original.visits} className='w-4' />
        <AudienceSourceCell
          referrerHistory={row.original.referrerHistory}
          utmParams={row.original.utmParams}
          actions={row.original.latestActions}
          className='w-4'
        />
      </div>
    </div>
  );
}

/**
 * Renders the last action cell (most recent action only)
 */
export function renderLastActionCell({
  row,
}: CellContext<AudienceMember, AudienceMember['latestActions']>) {
  return <AudienceLastActionCell actions={row.original.latestActions} />;
}

/**
 * Renders the LTV (Lifetime Value) cell with tier indicator and tooltip
 */
export function renderLtvCell({ row }: CellContext<AudienceMember, number>) {
  return (
    <AudienceLtvCell
      tipAmountTotalCents={row.original.tipAmountTotalCents}
      tipCount={row.original.tipCount}
      visits={row.original.visits}
      engagementScore={row.original.engagementScore}
      streamingClicks={row.original.ltvStreamingClicks}
      tipClickValueCents={row.original.ltvTipClickValueCents}
      merchSalesCents={row.original.ltvMerchSalesCents}
      ticketSalesCents={row.original.ltvTicketSalesCents}
    />
  );
}

/**
 * Renders the email cell for subscribers
 */
export function renderEmailCell({
  getValue,
}: CellContext<AudienceMember, string | null>) {
  return <span className='text-secondary-token'>{getValue() ?? '—'}</span>;
}

/**
 * Selection cell that reads dynamic state from context.
 * Avoids closing over selectedIds/page/pageSize which would destabilize column defs.
 */
export function SelectCell({ row }: CellContext<AudienceMember, unknown>) {
  const { selectedIds } = useAudienceTableVolatileContext();
  const { toggleSelect } = useAudienceTableStableContext();
  const rowNumber = row.index + 1;
  return (
    <AudienceRowSelectionCell
      rowNumber={rowNumber}
      isChecked={selectedIds.has(row.original.id)}
      displayName={row.original.displayName}
      onToggle={() => toggleSelect(row.original.id)}
    />
  );
}

/**
 * Last-seen cell that reads menu open state from context.
 * Avoids closing over openMenuRowId which would destabilize column defs.
 */
export function LastSeenCell({
  row,
}: CellContext<AudienceMember, string | null>) {
  const { openMenuRowId } = useAudienceTableVolatileContext();
  const { setOpenMenuRowId } = useAudienceTableStableContext();
  return (
    <AudienceLastSeenCell
      row={row.original}
      lastSeenAt={row.original.lastSeenAt}
      isMenuOpen={openMenuRowId === row.original.id}
      onMenuOpenChange={open => setOpenMenuRowId(open ? row.original.id : null)}
    />
  );
}

/**
 * Menu cell that reads context menu items from context.
 * Avoids closing over getContextMenuItems which would destabilize column defs.
 */
export function MenuCell({ row }: CellContext<AudienceMember, unknown>) {
  const { getContextMenuItems } = useAudienceTableStableContext();
  const contextMenuItems = getContextMenuItems(row.original);
  const actionMenuItems = convertContextMenuItems(contextMenuItems);

  return (
    <div className='flex items-center justify-end'>
      <TableActionMenu items={actionMenuItems} align='end' />
    </div>
  );
}

/**
 * Renders the identification indicator cell
 */
export function renderIdentificationCell({
  row,
}: CellContext<AudienceMember, AudienceMember['type']>) {
  return (
    <AudienceIdentificationIndicator
      type={row.original.type}
      hasEmail={Boolean(row.original.email)}
      hasPhone={Boolean(row.original.phone)}
      spotifyConnected={row.original.spotifyConnected}
    />
  );
}

/**
 * Touring city badge cell - reads touring city map from context.
 */
export function TouringCityCell({ row }: CellContext<AudienceMember, unknown>) {
  const { getTouringCity } = useAudienceTableStableContext();
  const info = getTouringCity(row.original);
  return (
    <AudienceTouringBadge
      touringCity={info?.city ?? null}
      showDate={info?.showDate ?? null}
    />
  );
}

type SubtitlePart = { key: string; text: string; className?: string };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildUserSubtitleParts(
  m: AudienceMember,
  hiddenMetadataColumns: {
    readonly location: boolean;
    readonly source: boolean;
    readonly engagement: boolean;
    readonly lastSeen: boolean;
  }
): SubtitlePart[] {
  const parts: SubtitlePart[] = [];

  if (hiddenMetadataColumns.engagement && m.intentLevel === 'high') {
    parts.push({
      key: 'intent',
      text: 'High',
      className: 'font-caption text-emerald-600 dark:text-emerald-400',
    });
  } else if (hiddenMetadataColumns.engagement && m.intentLevel === 'medium') {
    parts.push({
      key: 'intent',
      text: 'Medium',
      className: 'font-caption text-amber-600 dark:text-amber-400',
    });
  }

  if (hiddenMetadataColumns.engagement && m.visits > 0) {
    parts.push({
      key: 'visits',
      text: `${m.visits} ${m.visits === 1 ? 'visit' : 'visits'}`,
    });
  }

  const locationCity = hiddenMetadataColumns.location
    ? (m.geoCity ?? m.geoCountry ?? null)
    : null;
  if (locationCity) {
    parts.push({ key: 'location', text: safeDecode(locationCity) });
  }

  const latestSource =
    hiddenMetadataColumns.source && m.latestActions[0]?.sourceLabel
      ? m.latestActions[0].sourceLabel
      : null;
  if (latestSource) {
    parts.push({ key: 'source', text: latestSource });
  }

  if (hiddenMetadataColumns.lastSeen && m.lastSeenAt) {
    parts.push({
      key: 'last-seen',
      text: formatTimeAgo(m.lastSeenAt),
      className: 'tabular-nums',
    });
  }

  return parts;
}

/**
 * Renders the user cell with type dot, inline touring badge,
 * and a metadata subtitle that ensures info density at every breakpoint.
 *
 * The subtitle shows engagement, location, and last-seen data so the
 * User column remains informative even when other columns are hidden
 * at narrow viewport widths.
 */
export function UserCellWithTouring({
  row,
}: CellContext<AudienceMember, string | null>) {
  const { getTouringCity, hiddenMetadataColumns } =
    useAudienceTableStableContext();
  const touringInfo = getTouringCity(row.original);
  const m = row.original;
  const subtitleParts = buildUserSubtitleParts(m, hiddenMetadataColumns);

  return (
    <div className='flex items-center gap-2 min-w-0'>
      <div className='flex-1 min-w-0 flex flex-col justify-center'>
        <AudienceUserCell
          displayName={m.displayName}
          type={m.type}
          tags={m.tags}
          deviceType={m.deviceType}
          geoCity={m.geoCity}
          geoCountry={m.geoCountry}
          showTypeDot
          className='min-w-0'
        />
        {subtitleParts.length > 0 && (
          <div className='flex items-center gap-1 min-w-0 pl-[22px] text-2xs text-tertiary-token leading-tight'>
            {subtitleParts.map((part, i) => (
              <span key={part.key} className='flex items-center gap-1 min-w-0'>
                {i > 0 && (
                  <span
                    className='text-quaternary-token select-none shrink-0'
                    aria-hidden='true'
                  >
                    ·
                  </span>
                )}
                <span className={cn('truncate', part.className)}>
                  {part.text}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
      {touringInfo && (
        <AudienceTouringBadge
          touringCity={touringInfo.city}
          showDate={touringInfo.showDate}
        />
      )}
    </div>
  );
}

/**
 * Renders the location cell from the row's locationLabel field.
 */
export function renderLocationCellFromRow({
  row,
}: CellContext<AudienceMember, string | null>) {
  return <AudienceLocationCell locationLabel={row.original.locationLabel} />;
}

/**
 * Renders a plain numeric visits cell without intent decoration.
 */
export function renderVisitsNumberCell({
  getValue,
}: CellContext<AudienceMember, number>) {
  const visits = getValue();
  return (
    <span className='tabular-nums text-app font-normal text-secondary-token'>
      {visits}
    </span>
  );
}

/**
 * Renders the type badge cell (standalone column version).
 */
export function renderTypeBadgeCell({
  getValue,
}: CellContext<AudienceMember, AudienceMemberType>) {
  return <AudienceTypeBadge type={getValue()} />;
}

/**
 * Renders the engagement cell (visits count + intent icon).
 */
export function renderEngagementCell({
  row,
}: CellContext<AudienceMember, number>) {
  return (
    <AudienceEngagementCell
      visits={row.original.visits}
      intentLevel={row.original.intentLevel}
    />
  );
}

/**
 * Renders last action + last seen time combined in one cell.
 */
export function renderLastSeenActionCell({
  row,
}: CellContext<AudienceMember, AudienceMember['latestActions']>) {
  return (
    <AudienceLastActionCell
      actions={row.original.latestActions}
      lastSeenAt={row.original.lastSeenAt}
    />
  );
}

/**
 * Quick actions cell with View Profile, Send Notification, Export, and Block.
 * Reads handlers from context to keep column defs stable.
 */
export function QuickActionsCell({
  row,
}: CellContext<AudienceMember, unknown>) {
  const { onExportMember, onBlockMember, onViewProfile, onSendNotification } =
    useAudienceTableStableContext();
  const member = row.original;
  const canNotify = Boolean(member.email || member.phone);

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: stopPropagation prevents row click when using action buttons
    <div
      role='toolbar'
      className='flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100'
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <button
        type='button'
        onClick={() => onViewProfile(member)}
        className='inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-interactive-hover hover:text-secondary-token focus-visible:outline-none focus-visible:bg-interactive-hover'
        aria-label='View profile'
        title='View profile'
      >
        <Eye className='h-4 w-4' />
      </button>
      {canNotify && (
        <button
          type='button'
          onClick={() => onSendNotification(member)}
          className='inline-flex h-7 w-7 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-interactive-hover hover:text-secondary-token focus-visible:outline-none focus-visible:bg-interactive-hover'
          aria-label='Send notification'
          title='Send notification'
        >
          <Bell className='h-4 w-4' />
        </button>
      )}
      <AudienceQuickActionsCell
        onExport={() => onExportMember(member)}
        onBlock={() => onBlockMember(member)}
      />
    </div>
  );
}
