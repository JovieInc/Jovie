'use client';

import { Button } from '@jovie/ui';
import { ExternalLink, Link2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TableEmptyState } from '@/components/organisms/table/atoms/TableEmptyState';
import {
  TableBody,
  TableHead,
  TableRoot,
} from '@/components/organisms/table/molecules/SemanticTable';
import {
  borders,
  presets,
  rowState,
  typography,
} from '@/components/organisms/table/table.styles';
import { copyToClipboard } from '@/hooks/useClipboard';
import { cn } from '@/lib/utils';
import type { LinkRow } from './links-model';

const STATUS_LABELS: Record<LinkRow['status'], string> = {
  active: 'Active',
  draft: 'Draft',
  scheduled: 'Scheduled',
  archived: 'Archived',
};

function StatusBadge({ status }: { readonly status: LinkRow['status'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs',
        status === 'active' && 'bg-surface-2 text-primary-token',
        status === 'archived' && 'bg-surface-1 text-tertiary-token',
        (status === 'draft' || status === 'scheduled') &&
          'bg-surface-1 text-secondary-token'
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function LinkInspector({ row }: { readonly row: LinkRow }) {
  const [copied, setCopied] = useState(false);

  return (
    <aside
      data-testid='links-inspector'
      className='flex w-full shrink-0 flex-col gap-4 border-l border-subtle p-4 lg:w-80'
      aria-label='Link Details'
    >
      <div className='flex flex-col gap-1'>
        <span className={typography.cellTertiary}>{row.type}</span>
        <h2 className='line-clamp-2 text-sm font-semibold text-primary-token'>
          {row.title}
        </h2>
      </div>

      <div className='flex flex-col gap-1'>
        <span className={typography.cellTertiary}>Jovie link</span>
        <div className='flex items-center gap-2'>
          <a
            href={row.jovieUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='truncate text-sm text-primary-token underline-offset-2 hover:underline'
          >
            {row.jovieUrl.replace(/^https?:\/\//u, '')}
          </a>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            onClick={async () => {
              if (await copyToClipboard(row.jovieUrl)) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>

      <dl className='flex flex-col gap-3 text-sm'>
        <div className='flex flex-col gap-0.5'>
          <dt className={typography.cellTertiary}>Destination</dt>
          <dd className='truncate text-secondary-token'>{row.destination}</dd>
        </div>
        <div className='flex flex-col gap-0.5'>
          <dt className={typography.cellTertiary}>Status</dt>
          <dd>
            <StatusBadge status={row.status} />
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
          className='mt-auto inline-flex items-center gap-1.5 text-sm text-primary-token underline-offset-2 hover:underline'
        >
          <ExternalLink className='size-3.5' aria-hidden='true' />
          Open entity
        </Link>
      ) : null}
    </aside>
  );
}

export function LinksPageClient({ rows }: { readonly rows: LinkRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRow = useMemo(
    () => rows.find(row => row.id === selectedId) ?? null,
    [rows, selectedId]
  );

  if (rows.length === 0) {
    return (
      <TableEmptyState
        testId='links-empty-state'
        icon={<Link2 className='size-5' aria-hidden='true' />}
        heading='No links yet'
        description='Jovie finds your stuff — releases, events, merch, videos, and profiles — creates trackable links for it, and measures what happens when those links are shared.'
      />
    );
  }

  return (
    <div
      className='flex min-h-0 flex-1 flex-col lg:flex-row'
      data-testid='links-workspace'
    >
      <div className='min-w-0 flex-1 overflow-auto'>
        <TableRoot className='w-full border-collapse'>
          <TableHead>
            <tr className={presets.tableHeaderRow}>
              <th className={cn(presets.tableHeaderCell, 'whitespace-nowrap')}>
                Jovie link
              </th>
              <th className={cn(presets.tableHeaderCell, 'whitespace-nowrap')}>
                Entity
              </th>
              <th className={cn(presets.tableHeaderCell, 'whitespace-nowrap')}>
                Type
              </th>
              <th className={cn(presets.tableHeaderCell, 'whitespace-nowrap')}>
                Destination
              </th>
              <th className={cn(presets.tableHeaderCell, 'whitespace-nowrap')}>
                Status
              </th>
              <th className={cn(presets.tableHeaderCell, 'whitespace-nowrap')}>
                Clicks
              </th>
              <th className={cn(presets.tableHeaderCell, 'whitespace-nowrap')}>
                Campaign
              </th>
            </tr>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <tr
                key={row.id}
                className={cn(
                  presets.tableRow,
                  borders.cell,
                  'cursor-pointer',
                  selectedId === row.id && rowState.selected
                )}
                onClick={() => setSelectedId(row.id)}
              >
                <td className={presets.tableCell}>
                  <button
                    type='button'
                    className='max-w-56 truncate text-left text-primary-token'
                    onClick={() => setSelectedId(row.id)}
                  >
                    {row.jovieUrl.replace(/^https?:\/\//u, '')}
                  </button>
                </td>
                <td className={presets.tableCell}>
                  <span className='block max-w-48 truncate'>{row.title}</span>
                </td>
                <td className={presets.tableCell}>{row.type}</td>
                <td className={presets.tableCell}>
                  <span className='block max-w-56 truncate text-secondary-token'>
                    {row.destination.replace(/^https?:\/\//u, '')}
                  </span>
                </td>
                <td className={presets.tableCell}>
                  <StatusBadge status={row.status} />
                </td>
                <td className={presets.tableCell}>
                  {row.clicks === null ? '—' : row.clicks}
                </td>
                <td className={presets.tableCell}>
                  <span className='block max-w-40 truncate text-secondary-token'>
                    {row.campaign ?? row.utmSummary ?? '—'}
                  </span>
                </td>
              </tr>
            ))}
          </TableBody>
        </TableRoot>
      </div>
      {selectedRow ? <LinkInspector row={selectedRow} /> : null}
    </div>
  );
}
