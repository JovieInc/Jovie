'use client';

import { Button } from '@jovie/ui';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, GitPullRequest } from 'lucide-react';
import { useEffect, useState } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { SummerReconcileSection } from '@/components/features/admin/hud/SummerReconcileSection';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  DrawerPropertyRow,
  DrawerSection,
  EntityHeader,
  EntityHeaderThumbnail,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import {
  parseShippingCockpitProjection,
  type ShippingCockpitProjection,
} from '@/lib/ovie/shipping-state/client';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/date-formatting';

type TaskFeed = ShippingCockpitProjection['operationalTasks'];
type Task = TaskFeed['tasks'][number];
type Delta = TaskFeed['deltas'][number];

const STALLED_AFTER_MS = 24 * 60 * 60_000;

export type MatrixAttention =
  | 'blocked'
  | 'failing'
  | 'stalled'
  | 'queued'
  | 'ok';

export type MatrixRow = {
  readonly id: Task['id'];
  readonly identifier: string;
  readonly title: string;
  readonly stage: Task['workflowState'];
  readonly attention: MatrixAttention;
  readonly prNumber: number | null;
  readonly prUrl: string | null;
  readonly linearUrl: string | null;
  readonly branch: string | null;
  readonly agent: 'devin' | 'codex' | null;
  readonly checksRollup: 'success' | 'failure' | 'pending' | 'unknown';
  readonly failingChecks: readonly string[];
  readonly queuePosition: number | null;
  readonly queueState: string | null;
  readonly sha: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly attempt: number | null;
  readonly retryAt: string | null;
  readonly transition: string | null;
};

function deltaLabel(delta: Delta | undefined): string | null {
  if (!delta) return null;
  if (delta.kind === 'added' || delta.fromState == null) return 'New';
  if (delta.kind === 'removed' || delta.toState == null) {
    return `${delta.fromState} → removed`;
  }
  return `${delta.fromState} → ${delta.toState}`;
}

function attentionFor(
  stage: Task['workflowState'],
  checksRollup: MatrixRow['checksRollup'],
  updatedAt: string | null,
  nowMs: number
): MatrixAttention {
  if (stage === 'blocked') return 'blocked';
  if (checksRollup === 'failure') return 'failing';
  if (stage === 'merge-queued') return 'queued';
  const updatedMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  if (
    Number.isFinite(updatedMs) &&
    nowMs - updatedMs > STALLED_AFTER_MS &&
    (stage === 'running' || stage === 'retrying' || stage === 'in-review')
  ) {
    return 'stalled';
  }
  return 'ok';
}

/** Rows for the shipping matrix — one stable row per Linear-owned task. */
export function buildMatrixRows(feed: TaskFeed, nowMs: number): MatrixRow[] {
  const deltas = new Map(feed.deltas.map(delta => [delta.taskId, delta]));
  return feed.tasks.map(task => {
    const pr = task.pullRequest ?? null;
    return {
      id: task.id,
      identifier: task.linearIdentifier,
      title: task.title,
      stage: task.workflowState,
      attention: attentionFor(
        task.workflowState,
        pr?.checks.rollup ?? 'unknown',
        task.updatedAt,
        nowMs
      ),
      prNumber: pr?.number ?? null,
      prUrl: pr?.url ?? null,
      linearUrl: task.linearUrl,
      branch: pr?.branch ?? null,
      agent: pr?.agent ?? null,
      checksRollup: pr?.checks.rollup ?? 'unknown',
      failingChecks: pr?.checks.failing ?? [],
      queuePosition: pr?.queuePosition ?? null,
      queueState: pr?.queueState ?? null,
      sha: task.sourceRevision,
      createdAt: pr?.createdAt ?? null,
      updatedAt: task.updatedAt,
      attempt: task.attempt,
      retryAt: task.retryAt,
      transition: deltaLabel(deltas.get(task.id)),
    };
  });
}

function stageTone(
  stage: Task['workflowState'],
  attention: MatrixAttention
): 'good' | 'warning' | 'bad' | 'neutral' {
  if (attention === 'blocked' || attention === 'failing') return 'bad';
  switch (stage) {
    case 'merge-queued':
    case 'merged':
    case 'production-verified':
      return 'good';
    case 'retrying':
    case 'queued':
      return 'warning';
    default:
      return 'neutral';
  }
}

const STAGE_LABELS: Record<Task['workflowState'], string> = {
  queued: 'Queued',
  running: 'Running',
  retrying: 'Retrying',
  blocked: 'Blocked',
  'in-review': 'In review',
  'merge-queued': 'Merge queued',
  merged: 'Merged',
  'production-verified': 'Production verified',
};

const ATTENTION_LABELS: Record<Exclude<MatrixAttention, 'ok'>, string> = {
  blocked: 'Blocked',
  failing: 'Failing checks',
  stalled: 'Stalled',
  queued: 'In merge queue',
};

function ChecksCell({ row }: Readonly<{ readonly row: MatrixRow }>) {
  if (row.checksRollup === 'failure') {
    const names = failingChecksLabel(row.failingChecks);
    return (
      <span
        className='text-error'
        title={row.failingChecks.join('\n') || undefined}
      >
        Failing — {names}
      </span>
    );
  }
  if (row.checksRollup === 'success') {
    return <span className='text-success'>Green</span>;
  }
  if (row.checksRollup === 'pending') {
    return <span className='text-secondary-token'>Pending</span>;
  }
  return <span className='text-tertiary-token'>UNKNOWN</span>;
}

function failingChecksLabel(failingChecks: readonly string[]): string {
  if (failingChecks.length === 0) return 'checks failing';
  const visible = failingChecks.slice(0, 2).join(', ');
  const remaining = failingChecks.length - 2;
  return remaining > 0 ? `${visible} +${remaining}` : visible;
}

function QueueCell({ row }: Readonly<{ readonly row: MatrixRow }>) {
  if (row.queuePosition != null) {
    return (
      <span className='text-secondary-token'>
        #{row.queuePosition}
        {row.queueState
          ? ` · ${row.queueState.toLowerCase().replaceAll('_', ' ')}`
          : ''}
      </span>
    );
  }
  return <span className='text-tertiary-token'>—</span>;
}

const ROW_ATTENTION_CLASS: Record<MatrixAttention, string> = {
  blocked: 'border-l-2 border-l-error bg-error-subtle',
  failing: 'border-l-2 border-l-error bg-error-subtle',
  stalled: 'border-l-2 border-l-warning',
  queued: 'border-l-2 border-l-success',
  ok: 'border-l-2 border-l-transparent',
};

function railAttentionTone(row: MatrixRow): 'good' | 'warning' | 'bad' {
  if (row.attention === 'queued' && row.stage === 'merge-queued') return 'good';
  if (row.attention === 'stalled') return 'warning';
  return 'bad';
}

function ShippingRowRailHeader({ row }: Readonly<{ row: MatrixRow }>) {
  const subtitle =
    row.prNumber == null
      ? row.identifier
      : `${row.identifier} · PR #${row.prNumber}`;
  const badge =
    row.attention === 'ok' ? undefined : (
      <HudStatusPill
        label={ATTENTION_LABELS[row.attention]}
        tone={railAttentionTone(row)}
      />
    );
  return (
    <div className='px-3 pt-3'>
      <EntityHeader
        thumbnail={
          <EntityHeaderThumbnail
            variant='connection'
            name={row.identifier}
            icon={<GitPullRequest className='h-5 w-5' aria-hidden='true' />}
          />
        }
        title={row.title}
        subtitle={subtitle}
        badge={badge}
      />
    </div>
  );
}

/**
 * The next expected transition for the task's current stage. Purely
 * descriptive — presentation only, never a new control plane. Worker
 * admission and priority stay with the runtime.
 */
function nextExpectedAction(row: MatrixRow): string {
  switch (row.stage) {
    case 'blocked':
      return 'Resolve the failing dependency, then the runtime resumes.';
    case 'retrying':
      return row.retryAt
        ? `Scheduled retry at ${new Date(row.retryAt).toLocaleTimeString(
            'en-US',
            { hour: 'numeric', minute: '2-digit' }
          )}.`
        : 'Scheduled backoff — a retry is queued by the runtime.';
    case 'queued':
      return 'Awaiting worker admission.';
    case 'running':
      return 'In flight — observe for completion or failure.';
    case 'in-review':
      return 'Awaiting review and required checks.';
    case 'merge-queued':
      return 'Awaiting the native merge queue.';
    case 'merged':
      return 'Awaiting production verification.';
    case 'production-verified':
      return 'None — verified in production.';
  }
}

function ShippingRowRailContent({ row }: Readonly<{ row: MatrixRow }>) {
  const headSha = row.sha ? row.sha.slice(0, 7) : 'UNKNOWN';
  const opened = row.createdAt ? formatTimeAgo(row.createdAt) : 'UNKNOWN';
  const lastTransition =
    row.transition ??
    (row.updatedAt ? formatTimeAgo(row.updatedAt) : 'UNKNOWN');

  return (
    <>
      <DrawerSection title='Status' sectionKind='status'>
        <DrawerPropertyRow label='Stage' value={STAGE_LABELS[row.stage]} />
        <DrawerPropertyRow label='Checks' value={<ChecksCell row={row} />} />
        <DrawerPropertyRow label='Queue' value={<QueueCell row={row} />} />
        <DrawerPropertyRow label='Owner' value={row.agent ?? 'UNKNOWN'} />
        <DrawerPropertyRow label='Branch' value={row.branch ?? 'UNKNOWN'} />
        <DrawerPropertyRow label='Head SHA' value={headSha} />
        <DrawerPropertyRow label='Opened' value={opened} />
        {row.attempt == null ? null : (
          <DrawerPropertyRow label='Attempt' value={row.attempt} />
        )}
        <DrawerPropertyRow label='Last Transition' value={lastTransition} />
        <DrawerPropertyRow
          label='Next Expected Action'
          value={nextExpectedAction(row)}
        />
      </DrawerSection>
      {row.failingChecks.length > 0 ? (
        <DrawerSection title='Failing checks' sectionKind='details'>
          <ul className='space-y-1 px-1 text-xs text-error'>
            {row.failingChecks.map(name => (
              <li key={name} className='truncate' title={name}>
                {name}
              </li>
            ))}
          </ul>
        </DrawerSection>
      ) : null}
      <DrawerSection title='Evidence' sectionKind='links'>
        {row.prUrl ? (
          <DrawerPropertyRow
            label='Pull Request'
            value={
              <a
                href={row.prUrl}
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-1 text-accent-blue hover:underline'
              >
                #{row.prNumber} on GitHub
                <ExternalLink className='h-3 w-3' aria-hidden='true' />
              </a>
            }
          />
        ) : null}
        {row.linearUrl ? (
          <DrawerPropertyRow
            label='Linear'
            value={
              <a
                href={row.linearUrl}
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center gap-1 text-accent-blue hover:underline'
              >
                {row.identifier}
                <ExternalLink className='h-3 w-3' aria-hidden='true' />
              </a>
            }
          />
        ) : null}
        {!row.prUrl && !row.linearUrl ? (
          <p className='px-1 text-xs text-tertiary-token'>
            No external evidence links for this item.
          </p>
        ) : null}
      </DrawerSection>
      <SummerReconcileSection indicated={row.attention !== 'ok'} />
    </>
  );
}

export function ShippingRowRail({
  row,
  onClose,
}: Readonly<{ readonly row: MatrixRow | null; readonly onClose: () => void }>) {
  return (
    <EntitySidebarShell
      isOpen={Boolean(row)}
      width={400}
      ariaLabel='Work item details'
      data-testid='shipping-row-rail'
      scrollStrategy='shell'
      onClose={onClose}
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      isEmpty={!row}
      emptyMessage='Select a work item to inspect it.'
      entityHeader={row ? <ShippingRowRailHeader row={row} /> : undefined}
    >
      {row ? <ShippingRowRailContent row={row} /> : null}
    </EntitySidebarShell>
  );
}

function matrixSummary(
  query: Readonly<{ isPending: boolean; isError: boolean }>,
  rowCount: number,
  attentionCount: number,
  syncState: TaskFeed['syncState'] | undefined
): string {
  if (query.isPending) return 'Loading in-flight work…';
  if (query.isError) return 'UNKNOWN — observation failed. Refresh to retry.';
  return `${rowCount} open · ${attentionCount} need attention · ${syncState ?? 'unknown'} cache`;
}

/**
 * Live PR / merge-queue status matrix: one row per Linear-owned work item in
 * flight, with checks, queue state, owner, age, and last transition. Rows open
 * the right rail for GitHub/Linear drill-in (JOV-6893).
 */
export function ShippingMatrix() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const query = useQuery({
    queryKey: ['ovie', 'shipping-state'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/hud/shipping-state', {
        signal,
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(
          `Shipping observation unavailable (${response.status})`
        );
      }
      const data = parseShippingCockpitProjection(await response.json());
      if (!data) throw new Error('Shipping receipt could not be validated');
      return data;
    },
    staleTime: 0,
    gcTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const [selectedId, setSelectedId] = useState<MatrixRow['id'] | null>(null);
  const feed = query.data?.operationalTasks;
  const rows = feed ? buildMatrixRows(feed, now) : [];
  const selected = rows.find(row => row.id === selectedId) ?? null;
  const attentionCount = rows.filter(
    row =>
      row.attention === 'blocked' ||
      row.attention === 'failing' ||
      row.attention === 'stalled'
  ).length;

  return (
    <>
      <ContentSurfaceCard
        surface='details'
        className='overflow-hidden'
        data-testid='shipping-matrix'
      >
        <div className='flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-subtle px-3 py-2'>
          <div className='min-w-0'>
            <h2
              id='shipping-matrix-title'
              className='line-clamp-2 text-app font-semibold text-primary-token'
            >
              In-flight Work
            </h2>
            <p className='truncate text-2xs text-tertiary-token'>
              {matrixSummary(
                query,
                rows.length,
                attentionCount,
                feed?.syncState
              )}
            </p>
          </div>
          <Button
            variant='secondary'
            size='sm'
            onClick={() => {
              void query.refetch();
            }}
            disabled={query.isFetching}
          >
            {query.isFetching ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
        <div className='overflow-x-auto'>
          <table
            className='w-full text-left text-xs tabular-nums'
            aria-labelledby='shipping-matrix-title'
          >
            <thead>
              <tr className='text-2xs text-tertiary-token'>
                {[
                  'Work',
                  'Stage',
                  'Checks',
                  'Queue',
                  'Owner',
                  'Age',
                  'Last transition',
                ].map(label => (
                  <th
                    key={label}
                    scope='col'
                    className='p-2 font-medium whitespace-nowrap'
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !query.isPending ? (
                <tr className='border-t border-subtle'>
                  <td
                    colSpan={7}
                    className='p-6 text-center text-secondary-token'
                  >
                    {query.isError
                      ? 'Work matrix unavailable.'
                      : 'No open lane pull requests.'}
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr
                    key={row.id}
                    data-testid={`shipping-row-${row.identifier}`}
                    aria-selected={selectedId === row.id}
                    className={cn(
                      'cursor-pointer border-t border-subtle transition-colors hover:bg-surface-1',
                      ROW_ATTENTION_CLASS[row.attention],
                      selectedId === row.id && 'bg-surface-1'
                    )}
                    onClick={() =>
                      setSelectedId(prev => (prev === row.id ? null : row.id))
                    }
                  >
                    <th scope='row' className='relative max-w-0 truncate p-2'>
                      <Button
                        type='button'
                        variant='link'
                        size='sm'
                        aria-expanded={selectedId === row.id}
                        aria-label={`Inspect ${row.identifier}: ${row.title}`}
                        className='absolute inset-0'
                      />
                      <div aria-hidden='true' className='min-w-0'>
                        <div className='truncate font-medium text-primary-token'>
                          {row.title}
                        </div>
                        <div className='truncate text-2xs text-tertiary-token'>
                          {row.identifier}
                          {row.prNumber != null ? ` · #${row.prNumber}` : ''}
                          {row.attention !== 'ok' && row.attention !== 'queued'
                            ? ` · ${ATTENTION_LABELS[row.attention]}`
                            : ''}
                        </div>
                      </div>
                    </th>
                    <td className='p-2 whitespace-nowrap'>
                      <HudStatusPill
                        label={STAGE_LABELS[row.stage]}
                        tone={stageTone(row.stage, row.attention)}
                      />
                    </td>
                    <td className='max-w-48 truncate p-2 whitespace-nowrap'>
                      <ChecksCell row={row} />
                    </td>
                    <td className='p-2 whitespace-nowrap'>
                      <QueueCell row={row} />
                    </td>
                    <td className='p-2 whitespace-nowrap text-secondary-token'>
                      {row.agent ?? '—'}
                    </td>
                    <td className='p-2 whitespace-nowrap text-secondary-token'>
                      {row.createdAt ? formatTimeAgo(row.createdAt) : '—'}
                    </td>
                    <td className='p-2 whitespace-nowrap text-secondary-token'>
                      {row.transition ??
                        (row.updatedAt ? formatTimeAgo(row.updatedAt) : '—')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ContentSurfaceCard>
      <ShippingRowRail row={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
