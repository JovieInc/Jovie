'use client';

import { AlertTriangle, ListFilter } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';
import { toast } from '@/components/feedback';
import { PageShell } from '@/components/organisms/PageShell';
import { TableEmptyState } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import {
  type ClientListAction,
  getListErrorMessage,
  useOvieListActionsMutation,
  useOvieSmartViewQuery,
} from '@/lib/queries/useOvieListsQuery';
import { CreatorSourcingRow } from './CreatorSourcingRow';

/**
 * /app/ov/lists/views/[viewId]: one saved filter across every list. Rows
 * stay editable; each edit is written to the row's own list, so it still
 * trains that list's learner.
 */
export function OvieSmartViewWorkspace({
  viewId,
}: {
  readonly viewId: string;
}) {
  const query = useOvieSmartViewQuery(viewId);
  const actions = useOvieListActionsMutation();
  const detail = query.data;
  const creatorsById = useMemo(
    () => new Map((detail?.creators ?? []).map(c => [c.id, c])),
    [detail?.creators]
  );

  const run = (listId: string, batch: ClientListAction[]) =>
    actions.mutate(
      { listId, actions: batch },
      { onError: error => toast.error(getListErrorMessage(error)) }
    );

  let body: ReactNode;
  if (query.isPending) {
    body = (
      <div
        className='h-full'
        role='status'
        aria-busy='true'
        aria-label='Loading View'
        data-testid='ovie-smart-view-loading'
      />
    );
  } else if (!detail) {
    body = (
      <TableEmptyState
        icon={<AlertTriangle className='h-5 w-5' aria-hidden='true' />}
        heading='View unavailable'
        description='This smart view could not load.'
        variant='error'
        action={{ label: 'Retry', onClick: () => void query.refetch() }}
      />
    );
  } else if (detail.rows.length === 0) {
    body = (
      <TableEmptyState
        icon={<ListFilter className='h-5 w-5' aria-hidden='true' />}
        heading={`Nothing in ${detail.view.name}`}
        description='This view hides itself in the sidebar until a creator matches it.'
      />
    );
  } else {
    body = (
      <ul aria-label={`${detail.view.name} creators`}>
        {detail.rows.map(({ listId, listName, member }) => (
          <CreatorSourcingRow
            key={`${listId}:${member.creatorId}`}
            creator={creatorsById.get(member.creatorId)}
            member={member}
            busy={actions.isPending}
            meta={
              <Link
                href={`${APP_ROUTES.ADMIN_LISTS}/${listId}`}
                className='focus-ring-themed rounded-sm hover:text-secondary-token'
              >
                {listName}
              </Link>
            }
            onRate={rating =>
              run(listId, [
                { type: 'rate', creatorId: member.creatorId, rating },
              ])
            }
            onFavorite={favorite =>
              run(listId, [
                { type: 'favorite', creatorId: member.creatorId, favorite },
              ])
            }
            onAccept={() =>
              run(listId, [
                { type: 'accept_suggestion', creatorId: member.creatorId },
              ])
            }
            onReject={() =>
              run(listId, [
                { type: 'reject_suggestion', creatorId: member.creatorId },
              ])
            }
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
      data-testid='ovie-smart-view-page'
      contentClassName='min-h-0 overflow-y-auto'
    >
      {body}
    </PageShell>
  );
}
