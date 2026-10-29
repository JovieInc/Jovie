'use client';

import { Button } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EntitySidebarShell } from '@/components/molecules/drawer/EntitySidebarShell';
import { typography } from '@/components/organisms/table/table.styles';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { LinkStatusBadge } from './LinkStatusBadge';
import type { LinkRow } from './links-model';

export function LinksInspectorHost({
  row,
  onClose,
}: {
  readonly row: LinkRow | null;
  readonly onClose: () => void;
}) {
  useRegisterRightPanel(
    row ? <LinkInspector row={row} onClose={onClose} /> : null
  );
  return null;
}

export function LinkInspector({
  row,
  onClose,
}: {
  readonly row: LinkRow;
  readonly onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

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
