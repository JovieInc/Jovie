'use client';

import { Button } from '@jovie/ui';
import { ExternalLink, Link2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EntitySidebarShell } from '@/components/molecules/drawer';
import { TableEmptyState } from '@/components/organisms/table/atoms/TableEmptyState';
import { UnifiedTable } from '@/components/organisms/table/organisms/UnifiedTable';
import { typography } from '@/components/organisms/table/table.styles';
import { APP_ROUTES } from '@/constants/routes';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import {
  LINKS_COLUMNS,
  LINKS_ROW_MODE,
  LinkStatusBadge,
  stripProtocol,
} from './links-columns';
import type { LinkRow } from './links-model';

function LinkInspector({
  row,
  onClose,
  onUnmount,
}: {
  readonly row: LinkRow;
  readonly onClose: () => void;
  readonly onUnmount: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copiedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => onUnmount, [onUnmount]);

  // The copy-feedback reset must never outlive the inspector: a dangling
  // timer fires setCopied after teardown and crashes non-DOM test
  // environments as an unhandled ReferenceError (run 42701166354).
  useEffect(
    () => () => {
      if (copiedResetRef.current !== null) clearTimeout(copiedResetRef.current);
    },
    []
  );

  return (
    <EntitySidebarShell
      isOpen
      ariaLabel='Link Details'
      title={row.title}
      onClose={onClose}
      scrollStrategy='shell'
      data-testid='links-inspector'
    >
      <div className='flex flex-col gap-4 text-sm'>
        <span className={typography.cellTertiary}>{row.type}</span>

        <div className='flex flex-col gap-1'>
          <span className={typography.cellTertiary}>Jovie link</span>
          <div className='flex items-center gap-2'>
            <a
              href={row.jovieUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='truncate text-primary-token underline-offset-2 hover:underline'
            >
              {stripProtocol(row.jovieUrl)}
            </a>
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              onClick={async () => {
                if (await copyToClipboard(row.jovieUrl)) {
                  setCopied(true);
                  if (copiedResetRef.current !== null) {
                    clearTimeout(copiedResetRef.current);
                  }
                  copiedResetRef.current = setTimeout(
                    () => setCopied(false),
                    1200
                  );
                }
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>

        <dl className='flex flex-col gap-3'>
          <div className='flex flex-col gap-0.5'>
            <dt className={typography.cellTertiary}>Destination</dt>
            <dd className='truncate text-secondary-token'>{row.destination}</dd>
          </div>
          <div className='flex flex-col gap-0.5'>
            <dt className={typography.cellTertiary}>Status</dt>
            <dd>
              <LinkStatusBadge status={row.status} />
            </dd>
          </div>
          <div className='flex flex-col gap-0.5'>
            <dt className={typography.cellTertiary}>Performance</dt>
            <dd className='text-secondary-token'>
              {row.clicks === null ? '—' : `${row.clicks} ${row.clicksLabel}`}
            </dd>
          </div>
          {row.campaign ? (
            <div className='flex flex-col gap-0.5'>
              <dt className={typography.cellTertiary}>Campaign</dt>
              <dd className='text-secondary-token'>{row.campaign}</dd>
            </div>
          ) : null}
          {row.utmSummary ? (
            <div className='flex flex-col gap-0.5'>
              <dt className={typography.cellTertiary}>Tracking</dt>
              <dd className='text-secondary-token'>utm: {row.utmSummary}</dd>
            </div>
          ) : null}
        </dl>

        {row.entityHref ? (
          <Link
            href={row.entityHref}
            className='inline-flex items-center gap-1.5 text-primary-token underline-offset-2 hover:underline'
          >
            <ExternalLink className='size-3.5' aria-hidden='true' />
            Open entity
          </Link>
        ) : null}
      </div>
    </EntitySidebarShell>
  );
}

export function LinksPageClient({ rows }: { readonly rows: LinkRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRow = useMemo(
    () => rows.find(row => row.id === selectedId) ?? null,
    [rows, selectedId]
  );
  const closeInspector = useCallback(() => setSelectedId(null), []);
  const originatingControlRef = useRef<HTMLElement | null>(null);

  const openInspector = useCallback((rowId: string) => {
    originatingControlRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelectedId(rowId);
  }, []);

  const handleRowClick = useCallback(
    (row: LinkRow) => openInspector(row.id),
    [openInspector]
  );

  // Arrow keys move the open inspector with the focused row. The table hands
  // back that row in display order, so this holds after a sort.
  const handleFocusedRowChange = useCallback(
    (_index: number, next: LinkRow | undefined) => {
      if (selectedId && next) setSelectedId(next.id);
    },
    [selectedId]
  );

  // The registered panel unmounts in a later context update. Restore focus
  // after that unmount, when its focused control has fallen back to <body>.
  // Never steal focus from a live control.
  const restoreOriginatingFocus = useCallback(() => {
    const target = originatingControlRef.current;
    const active = document.activeElement;
    const railOwnedFocus =
      active === document.body || active === document.documentElement;
    if (!target || !railOwnedFocus || !target.isConnected) return;
    if (target.closest('[inert], [aria-hidden="true"]')) return;
    target.focus({ preventScroll: true });
  }, []);

  // Entity-rail parity: present the inspector through the shell's right-rail
  // slot (AppShellFrame + AppShellRightRail) like every other workspace,
  // instead of a local aside bolted onto the table row.
  useRegisterRightPanel(
    selectedRow ? (
      <LinkInspector
        row={selectedRow}
        onClose={closeInspector}
        onUnmount={restoreOriginatingFocus}
      />
    ) : null
  );

  if (rows.length === 0) {
    return (
      <TableEmptyState
        testId='links-empty-state'
        icon={<Link2 className='size-5' aria-hidden='true' />}
        heading='No Links Yet'
        description='Every release, show, and video Jovie finds gets a trackable link here.'
        action={{ label: 'Open Releases', href: APP_ROUTES.RELEASES }}
      />
    );
  }

  return (
    <div
      className='flex min-h-0 flex-1 flex-col lg:flex-row'
      data-testid='links-workspace'
    >
      <div className='flex min-h-0 min-w-0 flex-1 overflow-auto'>
        <UnifiedTable
          data={rows}
          columns={LINKS_COLUMNS}
          rowMode={LINKS_ROW_MODE}
          columnSizing='schema'
          getRowId={row => row.id}
          getRowTestId={row => `links-row-${row.id}`}
          isRowSelected={row => row.id === selectedId}
          onRowClick={handleRowClick}
          onFocusedRowChange={handleFocusedRowChange}
          minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
          className='text-app'
          caption='Links'
        />
      </div>
    </div>
  );
}
