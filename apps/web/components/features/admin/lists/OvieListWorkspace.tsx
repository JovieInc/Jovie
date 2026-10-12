'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle, Sparkles, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import { Avatar } from '@/components/molecules/Avatar';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PageToolbarActionButton,
  PageToolbarTabButton,
  TableEmptyState,
  TableSearchBar,
} from '@/components/organisms/table';
import { AdminTableSubheader } from '@/features/admin/table/AdminTableHeader';
import {
  pendingSuggestions,
  suggestionPrecision,
} from '@/lib/ovie/lists/model';
import type { ListCreator } from '@/lib/ovie/lists/types';
import {
  type ClientListAction,
  getListErrorMessage,
  useOvieListActionsMutation,
  useOvieListCreatorSearchQuery,
  useOvieListDetailQuery,
  useSuggestOvieListMutation,
} from '@/lib/queries/useOvieListsQuery';
import {
  CreatorSourcingRow,
  creatorDisplayName,
  creatorFacts,
} from './CreatorSourcingRow';
import { TriageDeck } from './TriageDeck';

type Mode = 'list' | 'triage';

function precisionLabel(precision: ReturnType<typeof suggestionPrecision>) {
  if (precision.precision === null) return 'No suggestion decisions yet';
  const percent = Math.round(precision.precision * 100);
  return `${percent}% of suggestions kept (${precision.accepted} of ${precision.accepted + precision.rejected})`;
}

function AddCreatorSearch({
  memberIds,
  busy,
  onAdd,
}: {
  readonly memberIds: ReadonlySet<string>;
  readonly busy: boolean;
  readonly onAdd: (creator: ListCreator) => void;
}) {
  const [query, setQuery] = useState('');
  const results = useOvieListCreatorSearchQuery(query);
  const creators = (results.data?.creators ?? []).filter(
    creator => !memberIds.has(creator.id)
  );
  return (
    <div className='border-b border-subtle'>
      <div className='px-4 py-2'>
        <TableSearchBar
          value={query}
          onChange={setQuery}
          placeholder='Find a creator to add'
        />
      </div>
      {query.trim().length >= 2 ? (
        <ul aria-label='Creator Search Results' className='pb-1'>
          {results.isError ? (
            <li className='px-4 py-2 text-xs text-secondary-token'>
              Search failed. Edit the query to retry.
            </li>
          ) : null}
          {results.isSuccess && creators.length === 0 ? (
            <li className='px-4 py-2 text-xs text-tertiary-token'>
              No creators match.
            </li>
          ) : null}
          {creators.slice(0, 6).map(creator => (
            <li
              key={creator.id}
              className='flex min-h-10 items-center gap-3 px-4 py-1'
            >
              <Avatar
                src={creator.avatarUrl}
                alt=''
                name={creatorDisplayName(creator)}
                size='md'
                shape='person'
              />
              <span className='min-w-0 flex-1 truncate text-app text-primary-token'>
                {creatorDisplayName(creator)}
                <span className='ml-2 text-xs text-tertiary-token'>
                  {creatorFacts(creator)}
                </span>
              </span>
              <Button
                size='sm'
                variant='ghost'
                disabled={busy}
                onClick={() => onAdd(creator)}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * /app/ov/lists/[id]: one list as narrow people rows with ratings and
 * favorites, Jovie's suggested additions with their reasons, and a triage
 * mode that turns every decision into a training label for this list.
 */
export function OvieListWorkspace({ listId }: { readonly listId: string }) {
  const query = useOvieListDetailQuery(listId);
  const actions = useOvieListActionsMutation();
  const suggest = useSuggestOvieListMutation(listId);
  const [mode, setMode] = useState<Mode>('list');
  const detail = query.data;

  const creatorsById = useMemo(
    () => new Map((detail?.creators ?? []).map(c => [c.id, c])),
    [detail?.creators]
  );
  const members = useMemo(
    () => (detail?.list.members ?? []).filter(m => m.state === 'member'),
    [detail?.list.members]
  );
  const suggestions = useMemo(
    () => (detail ? pendingSuggestions(detail.list) : []),
    [detail]
  );
  const memberIds = useMemo(
    () => new Set((detail?.list.members ?? []).map(m => m.creatorId)),
    [detail?.list.members]
  );

  const run = (batch: ClientListAction[]) =>
    actions.mutate(
      { listId, actions: batch },
      { onError: error => toast.error(getListErrorMessage(error)) }
    );

  const requestSuggestions = () =>
    suggest.mutate(undefined, {
      onSuccess: ({ list }) => {
        const count = pendingSuggestions(list).length;
        if (count === 0) {
          toast.info(
            'Rate or favorite at least two creators so Jovie can learn this list.'
          );
        } else {
          setMode('triage');
        }
      },
      onError: error => toast.error(getListErrorMessage(error)),
    });

  if (query.isPending) {
    return (
      <PageShell frame='none' contentPadding='none' surfaceMode='table'>
        <div
          className='h-full'
          role='status'
          aria-busy='true'
          aria-label='Loading List'
          data-testid='ovie-list-loading'
        />
      </PageShell>
    );
  }

  if (!detail) {
    return (
      <PageShell frame='none' contentPadding='none' surfaceMode='table'>
        <TableEmptyState
          icon={<AlertTriangle className='h-5 w-5' aria-hidden='true' />}
          heading='List unavailable'
          description='This list could not load. It may have been deleted.'
          variant='error'
          action={{ label: 'Retry', onClick: () => void query.refetch() }}
        />
      </PageShell>
    );
  }

  const busy = actions.isPending;
  // Remount the deck only for a new suggestion batch, so progress survives
  // each decision's refetch.
  const suggestBatchKey = detail.list.labels.filter(
    label => label.signal === 'suggest'
  ).length;
  const precision = suggestionPrecision(detail.list);

  return (
    <PageShell
      frame='none'
      contentPadding='none'
      surfaceMode='table'
      data-testid='ovie-list-page'
      contentClassName='min-h-0'
    >
      <div className='flex h-full min-h-0 flex-col'>
        <AdminTableSubheader
          className='border-b border-(--app-shell-frame-seam)'
          start={
            <div className='flex items-center gap-0.5'>
              <PageToolbarTabButton
                label={`List ${members.length}`}
                active={mode === 'list'}
                onClick={() => setMode('list')}
              />
              <PageToolbarTabButton
                label={`Triage ${suggestions.length}`}
                active={mode === 'triage'}
                onClick={() => setMode('triage')}
              />
            </div>
          }
          end={
            <div className='flex items-center gap-2'>
              <span
                className='text-xs tabular-nums text-tertiary-token'
                data-testid='suggestion-precision'
              >
                {precisionLabel(precision)}
              </span>
              <PageToolbarActionButton
                label={suggest.isPending ? 'Suggesting' : 'Suggest More'}
                icon={<Sparkles className='h-3.5 w-3.5' aria-hidden='true' />}
                disabled={suggest.isPending}
                onClick={requestSuggestions}
              />
            </div>
          }
        />
        <div className='min-h-0 flex-1 overflow-y-auto'>
          {mode === 'triage' ? (
            suggestions.length > 0 ? (
              <TriageDeck
                key={suggestBatchKey}
                suggestions={suggestions}
                creatorsById={creatorsById}
                busy={busy}
                onDecide={run}
              />
            ) : (
              <TableEmptyState
                icon={<Sparkles className='h-5 w-5' aria-hidden='true' />}
                heading='Nothing to triage'
                description='Jovie suggests creators once you rate or favorite at least two on this list.'
                action={{ label: 'Suggest More', onClick: requestSuggestions }}
              />
            )
          ) : (
            <>
              <AddCreatorSearch
                memberIds={memberIds}
                busy={busy}
                onAdd={creator => run([{ type: 'add', creatorId: creator.id }])}
              />
              {members.length === 0 ? (
                <TableEmptyState
                  icon={<Users className='h-5 w-5' aria-hidden='true' />}
                  heading={`${detail.list.name} is empty`}
                  description='Add creators above. Rate and favorite a few so Jovie can learn what belongs here.'
                />
              ) : (
                <ul aria-label={`${detail.list.name} creators`}>
                  {members.map(member => (
                    <CreatorSourcingRow
                      key={member.creatorId}
                      creator={creatorsById.get(member.creatorId)}
                      member={member}
                      busy={busy}
                      onRate={rating =>
                        run([
                          { type: 'rate', creatorId: member.creatorId, rating },
                        ])
                      }
                      onFavorite={favorite =>
                        run([
                          {
                            type: 'favorite',
                            creatorId: member.creatorId,
                            favorite,
                          },
                        ])
                      }
                      onRemove={() =>
                        run([{ type: 'remove', creatorId: member.creatorId }])
                      }
                    />
                  ))}
                </ul>
              )}
              {suggestions.length > 0 ? (
                <section aria-label='Suggested By Jovie'>
                  <h2 className='px-4 pb-1 pt-4 text-xs font-medium text-secondary-token'>
                    Suggested By Jovie
                  </h2>
                  <ul>
                    {suggestions.map(member => (
                      <CreatorSourcingRow
                        key={member.creatorId}
                        creator={creatorsById.get(member.creatorId)}
                        member={member}
                        busy={busy}
                        onRate={() => undefined}
                        onFavorite={() => undefined}
                        onAccept={() =>
                          run([
                            {
                              type: 'accept_suggestion',
                              creatorId: member.creatorId,
                            },
                          ])
                        }
                        onReject={() =>
                          run([
                            {
                              type: 'reject_suggestion',
                              creatorId: member.creatorId,
                            },
                          ])
                        }
                      />
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
