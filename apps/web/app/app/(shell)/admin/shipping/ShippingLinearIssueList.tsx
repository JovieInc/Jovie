'use client';

import { ExternalLink } from 'lucide-react';
import { TaskListRow } from '@/components/features/dashboard/tasks/TaskListRow';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  type LinearIssueRow,
  linearIssueToTaskView,
  sortLinearIssuesByStatus,
} from '@/lib/ovie/linear-issue-task-view';
import { formatTimeAgo } from '@/lib/utils/date-formatting';

interface ShippingLinearIssueListProps {
  readonly issues: readonly LinearIssueRow[];
  readonly generatedAt: string | null;
  /** False when the live read failed; `issues` may then be an older copy. */
  readonly reachable: boolean;
}

function noop() {}

function headline(
  props: Pick<ShippingLinearIssueListProps, 'generatedAt' | 'reachable'>,
  hasIssues: boolean
): string {
  if (!props.reachable) {
    return hasIssues && props.generatedAt
      ? `Linear not reachable · showing issues from ${formatTimeAgo(props.generatedAt)}`
      : 'Linear not reachable';
  }
  return `Updated ${formatTimeAgo(props.generatedAt)}`;
}

export function ShippingLinearIssueList({
  issues,
  generatedAt,
  reachable,
}: Readonly<ShippingLinearIssueListProps>) {
  const rows = sortLinearIssuesByStatus(issues);
  const showRows = rows.length > 0;
  return (
    <ContentSurfaceCard
      intent='collection'
      aria-label='Linear Issues'
      data-testid='ovie-shipping-linear-issues'
      className='overflow-hidden'
    >
      <div className='flex min-h-16 items-center justify-between gap-3 border-b border-subtle px-3 py-2'>
        <div className='min-w-0'>
          <h2 className='truncate text-app font-semibold text-primary-token'>
            Linear Issues
          </h2>
          <p
            className='truncate text-2xs text-tertiary-token'
            data-testid='ovie-shipping-linear-updated'
          >
            {headline({ generatedAt, reachable }, showRows)}
          </p>
        </div>
      </div>
      {showRows ? (
        <div className='grid gap-1 p-2' aria-live='polite'>
          {rows.map(issue => (
            <TaskListRow
              key={issue.id}
              task={linearIssueToTaskView(issue)}
              identifierLabel={issue.identifier}
              onOpenRelease={noop}
              showAssignee={false}
              hideDue
              actionSlot={
                <a
                  href={issue.url}
                  target='_blank'
                  rel='noreferrer'
                  aria-label={`Open ${issue.identifier} in Linear`}
                  className='inline-flex h-10 w-10 items-center justify-center rounded-md text-tertiary-token hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55'
                >
                  <ExternalLink className='h-3.5 w-3.5' aria-hidden='true' />
                </a>
              }
            />
          ))}
        </div>
      ) : (
        <div className='grid min-h-24 place-items-center p-4 text-center'>
          <p
            className='text-app text-secondary-token'
            data-testid='ovie-shipping-linear-empty'
          >
            {reachable
              ? 'No active Linear issues.'
              : 'Linear could not be read, so this list is unknown, not empty.'}
          </p>
        </div>
      )}
    </ContentSurfaceCard>
  );
}
