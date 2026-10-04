'use client';

import { AlertTriangle, List, ListFilter } from 'lucide-react';
import Link from 'next/link';
import {
  listHref,
  smartViewHref,
} from '@/components/organisms/OperatorListsNav';
import { PageShell } from '@/components/organisms/PageShell';
import { TableEmptyState } from '@/components/organisms/table';
import { useOvieSidebarListsQuery } from '@/lib/queries/useOvieListsQuery';

function IndexRow({
  href,
  label,
  detail,
  icon: Icon,
}: {
  readonly href: string;
  readonly label: string;
  readonly detail: string;
  readonly icon: typeof List;
}) {
  return (
    <li className='border-b border-subtle'>
      <Link
        href={href}
        className='focus-ring-themed flex min-h-11 items-center gap-3 px-4 py-2 hover:bg-surface-1'
      >
        <Icon className='size-3.5 text-tertiary-token' aria-hidden='true' />
        <span className='min-w-0 flex-1 truncate text-app text-primary-token'>
          {label}
        </span>
        <span className='text-xs tabular-nums text-tertiary-token'>
          {detail}
        </span>
      </Link>
    </li>
  );
}

/** /app/ov/lists: lists, then smart views that currently match anything. */
export function OvieListsIndex() {
  const query = useOvieSidebarListsQuery();
  const data = query.data;

  let body = (
    <div
      className='h-full'
      role='status'
      aria-busy='true'
      aria-label='Loading Lists'
    />
  );
  if (query.isError && !data) {
    body = (
      <TableEmptyState
        icon={<AlertTriangle className='h-5 w-5' aria-hidden='true' />}
        heading='Lists unavailable'
        description='Your lists could not load.'
        variant='error'
        action={{ label: 'Retry', onClick: () => void query.refetch() }}
      />
    );
  } else if (data && data.lists.length === 0) {
    body = (
      <TableEmptyState
        icon={<List className='h-5 w-5' aria-hidden='true' />}
        heading='No lists yet'
        description='Create one from the sidebar for collabs, press, or anything else.'
      />
    );
  } else if (data) {
    body = (
      <ul aria-label='Lists And Smart Views'>
        {data.lists.map(list => (
          <IndexRow
            key={list.id}
            href={listHref(list.id)}
            label={list.name}
            detail={
              list.pendingSuggestions > 0
                ? `${list.count} · ${list.pendingSuggestions} suggested`
                : String(list.count)
            }
            icon={List}
          />
        ))}
        {data.smartViews.map(view => (
          <IndexRow
            key={view.id}
            href={smartViewHref(view.id)}
            label={view.name}
            detail={String(view.count)}
            icon={ListFilter}
          />
        ))}
      </ul>
    );
  }

  return (
    <PageShell
      frame='none'
      contentPadding='none'
      surfaceMode='table'
      data-testid='ovie-lists-page'
      contentClassName='min-h-0 overflow-y-auto'
    >
      {body}
    </PageShell>
  );
}
