'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import { Avatar } from '@/components/molecules/Avatar';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbarActionButton,
  PageToolbarTabButton,
  rowState,
  TableEmptyState,
} from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableSubheader } from '@/features/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type {
  ContactEvidenceDecision,
  ContactEvidenceItem,
} from '@/lib/contacts/certification';
import {
  OUTBOUND_NEXT_ACTION_LABELS,
  OUTBOUND_VIEW_LABELS,
  OUTBOUND_VIEWS,
  type OutboundBand,
  type OutboundCopy,
  type OutboundRejectReason,
  type OutboundRow,
  type OutboundView,
} from '@/lib/outbound/types';
import {
  getOutboundDecisionErrorMessage,
  useOutboundCertificationQuery,
  useOutboundDecisionMutation,
  useOutboundFactReviewMutation,
  useOutboundQueueQuery,
  useOutboundReadinessQuery,
  useOutboundRefreshEvidenceMutation,
} from '@/lib/queries/useOutboundQuery';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import { OutboundRail } from './OutboundRail';
import { OutboundReadinessPanel } from './OutboundReadinessPanel';
import {
  isTypingTarget,
  resolveOutboundKey,
  sendOutboundRailCommand,
} from './outbound-keys';

const columnHelper = createColumnHelper<OutboundRow>();

const targetRef = (row: OutboundRow) => ({
  leadId: row.leadId,
  expectedTargetRevision: row.approval.targetRevision,
});

const BAND_LABELS: Record<OutboundBand, string> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
  unknown: 'Not scored',
};

const BAND_TITLES = {
  fit: 'Fit band from the qualification fit score',
  ability: 'Ability to pay is not measured yet (JOV-6650)',
  intent: 'Buying intent is not measured yet (JOV-6650)',
} as const;

function bandColumn(id: keyof typeof BAND_TITLES, header: string) {
  return columnHelper.accessor(id, {
    header,
    cell: ({ getValue }) => {
      const band = getValue() as OutboundBand;
      return (
        <span
          title={BAND_TITLES[id]}
          className={cn(
            'text-xs tabular-nums',
            band === 'unknown'
              ? 'text-quaternary-token'
              : 'text-secondary-token'
          )}
        >
          {BAND_LABELS[band]}
        </span>
      );
    },
    size: 60,
    meta: id === 'fit' ? undefined : { priority: 2 },
  });
}

// biome-ignore lint/suspicious/noExplicitAny: TanStack Table requires any for mixed-value-type column arrays
type OutboundColumn = ColumnDef<OutboundRow, any>;

/** Actions Tim takes himself; the rest are waits shown as plain text. */
const ACTIONABLE = new Set([
  'build_profile',
  'review_facts',
  'approve_message',
  'send',
]);

function buildColumns(
  selected: ReadonlySet<string>,
  toggle: (leadId: string) => void,
  activeId: string | null,
  open: (row: OutboundRow) => void
): OutboundColumn[] {
  return [
    columnHelper.display({
      id: 'select',
      header: 'Select',
      cell: ({ row }) => (
        <input
          type='checkbox'
          aria-label={`Select ${row.original.name}`}
          checked={selected.has(row.original.leadId)}
          onClick={event => event.stopPropagation()}
          onChange={() => toggle(row.original.leadId)}
          className='h-3.5 w-3.5'
        />
      ),
      size: 32,
      meta: { headerVisibility: 'sr-only' },
    }),
    columnHelper.accessor('name', {
      header: 'Artist',
      cell: ({ row }) => (
        <span className='flex min-w-0 items-center gap-2'>
          <Avatar
            src={row.original.avatarUrl}
            alt=''
            name={row.original.name}
            size='md'
          />
          <span className='max-w-44 truncate text-app font-medium text-primary-token'>
            {row.original.name}
          </span>
          <span className='max-w-28 truncate text-xs text-tertiary-token'>
            @{row.original.handle}
          </span>
        </span>
      ),
      size: 260,
      meta: { primary: true },
    }),
    columnHelper.accessor('whyNow', {
      header: 'Why Now',
      cell: ({ getValue }) => (
        <span className='block max-w-56 truncate text-xs text-secondary-token'>
          {getValue() as string}
        </span>
      ),
      size: 200,
    }),
    bandColumn('fit', 'Fit'),
    bandColumn('ability', 'Ability'),
    bandColumn('intent', 'Intent'),
    columnHelper.accessor('certified', {
      header: 'Certified',
      cell: ({ row }) => (
        <span
          className={cn(
            'text-xs',
            row.original.certified
              ? 'text-primary-token'
              : 'text-quaternary-token'
          )}
        >
          {row.original.certified ? 'Yes' : 'No'}
        </span>
      ),
      size: 68,
    }),
    columnHelper.accessor('nextAction', {
      header: 'Next',
      cell: ({ row }) => {
        const label = OUTBOUND_NEXT_ACTION_LABELS[row.original.nextAction];
        if (!ACTIONABLE.has(row.original.nextAction))
          return (
            <span className='truncate text-xs text-tertiary-token'>
              {label}
            </span>
          );
        return (
          <Button
            size='sm'
            variant={row.original.leadId === activeId ? 'secondary' : 'ghost'}
            onClick={event => {
              event.stopPropagation();
              open(row.original);
            }}
          >
            {label.replace(/\b\w/g, letter => letter.toUpperCase())}
          </Button>
        );
      },
      size: 132,
    }),
  ];
}

export function OutboundWorkspace() {
  const query = useOutboundQueueQuery();
  // mutateAsync is stable; the mutation result object is not.
  const { mutateAsync: decide } = useOutboundDecisionMutation();
  const [view, setView] = useState<OutboundView>('ready');
  const [showReadiness, setShowReadiness] = useState(false);
  const readiness = useOutboundReadinessQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [bulk, setBulk] = useState<ReadonlySet<string>>(new Set());
  const [factIndex, setFactIndex] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queue = query.data;
  const rows = useMemo(
    () => (queue?.rows ?? []).filter(row => row.view === view),
    [queue, view]
  );
  const selected = useMemo(
    () => queue?.rows.find(row => row.leadId === selectedId) ?? null,
    [queue, selectedId]
  );
  const certificationQuery = useOutboundCertificationQuery(selectedId);
  const certification = certificationQuery.data?.certification ?? null;
  const { mutateAsync: reviewFact } = useOutboundFactReviewMutation();
  const { mutateAsync: refreshEvidence } = useOutboundRefreshEvidenceMutation();
  const facts = certification?.items ?? [];
  const activeFact = facts[Math.min(factIndex, facts.length - 1)] ?? null;

  useEffect(() => {
    setError(null);
    setFactIndex(0);
  }, [selectedId]);

  const toggleBulk = useCallback((leadId: string) => {
    setBulk(current => {
      const next = new Set(current);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }, []);

  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, done: string) => {
      setPending(key);
      setError(null);
      try {
        await action();
        toast.success(done);
      } catch (cause) {
        setError(getOutboundDecisionErrorMessage(cause));
      } finally {
        setPending(null);
      }
    },
    []
  );

  const onFact = useCallback(
    async (
      item: ContactEvidenceItem,
      answer: ContactEvidenceDecision,
      correction?: string
    ) => {
      if (!selected?.dedupeKey) return;
      await run(
        item.key,
        () =>
          reviewFact({
            action: 'review_evidence',
            dedupeKey: selected.dedupeKey,
            evidenceKey: item.key,
            evidenceRevision: item.revision,
            decision: answer,
            correction,
          }),
        correction ? 'Correction saved' : 'Fact recorded'
      );
    },
    [reviewFact, run, selected]
  );

  const onRefreshEvidence = useCallback(() => {
    if (!selected) return;
    void run(
      'refresh_evidence',
      () => refreshEvidence(selected.leadId),
      'Evidence refresh started. Facts fill in as enrichment finishes.'
    );
  }, [refreshEvidence, run, selected]);

  const onCertify = useCallback(() => {
    if (!selected?.dedupeKey || !certification) return;
    void run(
      'certify',
      () =>
        reviewFact({
          action: 'certify_profile',
          dedupeKey: selected.dedupeKey,
          evidenceRevision: certification.evidenceRevision,
        }),
      'Current facts certified'
    );
  }, [certification, reviewFact, run, selected]);

  const submitCopy = useCallback(
    (action: 'approve' | 'save_copy', copy: OutboundCopy) => {
      if (!selected) return;
      void run(
        action,
        () => decide({ action, ...targetRef(selected), copy }),
        action === 'approve'
          ? 'Approved. Nothing sends until outbound opens.'
          : 'Draft saved. It needs your approval.'
      );
    },
    [decide, run, selected]
  );
  const onApprove = useCallback(
    (copy: OutboundCopy) => submitCopy('approve', copy),
    [submitCopy]
  );
  const onSaveCopy = useCallback(
    (copy: OutboundCopy) => submitCopy('save_copy', copy),
    [submitCopy]
  );

  const targetsFor = useCallback(
    (fallback: OutboundRow | null) => {
      const chosen = (queue?.rows ?? []).filter(row => bulk.has(row.leadId));
      if (chosen.length) return chosen;
      return fallback ? [fallback] : [];
    },
    [bulk, queue]
  );

  const decideTargets = useCallback(
    (action: 'hold' | 'reject', reason?: OutboundRejectReason) => {
      const targets = targetsFor(selected);
      if (!targets.length) return;
      const items = targets.map(targetRef);
      const label = action === 'hold' ? 'Held' : 'Rejected';
      void run(
        action,
        async () => {
          await decide(
            action === 'hold'
              ? { action, items }
              : { action, items, reason: reason ?? 'other' }
          );
          setBulk(new Set());
        },
        targets.length > 1 ? `${label} ${targets.length}` : label
      );
    },
    [decide, run, selected, targetsFor]
  );
  const onHold = useCallback(() => decideTargets('hold'), [decideTargets]);
  const onReject = useCallback(
    (reason: OutboundRejectReason) => decideTargets('reject', reason),
    [decideTargets]
  );

  // Surface-scoped accelerators. Typing in the message editor is never stolen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const action = resolveOutboundKey(event);
      if (!action) return;
      event.preventDefault();
      if (action === 'next' || action === 'previous') {
        // The first j/k opens the focused person rather than skipping them.
        const step = selectedId ? (action === 'next' ? 1 : -1) : 0;
        const next = Math.max(
          0,
          Math.min(rows.length - 1, focusedIndex + step)
        );
        setFocusedIndex(next);
        setSelectedId(rows[next]?.leadId ?? null);
        return;
      }
      if (action === 'nextFact' || action === 'previousFact') {
        setFactIndex(current =>
          Math.max(
            0,
            Math.min(
              facts.length - 1,
              current + (action === 'nextFact' ? 1 : -1)
            )
          )
        );
        return;
      }
      if (action === 'toggleSelect' && rows[focusedIndex]) {
        toggleBulk(rows[focusedIndex].leadId);
        return;
      }
      if (action === 'hold') return onHold();
      if (action === 'approve' || action === 'reject') {
        sendOutboundRailCommand(action);
        return;
      }
      if (
        (action === 'yes' || action === 'no' || action === 'unsure') &&
        activeFact
      ) {
        void onFact(activeFact, action);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    activeFact,
    facts.length,
    focusedIndex,
    onFact,
    onHold,
    rows,
    selectedId,
    toggleBulk,
  ]);

  const columns = useMemo<OutboundColumn[]>(
    () =>
      buildColumns(bulk, toggleBulk, selectedId, row => {
        setSelectedId(row.leadId);
        setFocusedIndex(rows.indexOf(row));
      }),
    [bulk, rows, selectedId, toggleBulk]
  );

  const getRowClassName = useCallback(
    (row: OutboundRow) =>
      row.leadId === selectedId
        ? `group cursor-pointer ${rowState.selected}`
        : `group cursor-pointer ${rowState.hover}`,
    [selectedId]
  );

  const rail = useMemo(
    () => (
      <OutboundRail
        row={selected}
        certification={certification}
        certificationLoading={certificationQuery.isLoading}
        activeFactKey={activeFact?.key ?? null}
        pending={pending}
        error={error}
        onClose={() => setSelectedId(null)}
        onFact={onFact}
        onCertify={onCertify}
        onRefreshEvidence={onRefreshEvidence}
        onApprove={onApprove}
        onSaveCopy={onSaveCopy}
        onHold={onHold}
        onReject={onReject}
      />
    ),
    [
      activeFact,
      certification,
      certificationQuery.isLoading,
      error,
      onApprove,
      onCertify,
      onFact,
      onRefreshEvidence,
      onHold,
      onReject,
      onSaveCopy,
      pending,
      selected,
    ]
  );
  useRegisterRightPanel(rail);

  const emptyState = query.isError ? (
    <TableEmptyState
      icon={<AlertTriangle className='h-5 w-5' aria-hidden='true' />}
      heading='Outbound queue unavailable'
      description='The lead inventory could not load. Retry to check again.'
      variant='error'
      action={{ label: 'Retry', onClick: () => void query.refetch() }}
    />
  ) : (
    <TableEmptyState
      icon={<Send className='h-5 w-5' aria-hidden='true' />}
      heading={`Nobody in ${OUTBOUND_VIEW_LABELS[view]}`}
      description={
        view === 'replied'
          ? 'Reply capture is not wired to a provider yet, so replies cannot land here.'
          : 'People move here as you certify, approve, and send.'
      }
    />
  );

  return (
    <PageShell
      frame='none'
      contentPadding='none'
      surfaceMode='table'
      data-testid='ovie-outbound-page'
      contentClassName='min-h-0'
    >
      <div className='flex h-full min-h-0 flex-col'>
        <AdminTableSubheader
          className='border-b border-(--app-shell-frame-seam)'
          start={
            <div
              className='flex items-center gap-0.5 overflow-x-auto'
              role='toolbar'
              aria-label='Outbound Views'
            >
              {OUTBOUND_VIEWS.map(option => (
                <PageToolbarTabButton
                  key={option}
                  active={view === option}
                  onClick={() => {
                    setView(option);
                    setFocusedIndex(0);
                    setBulk(new Set());
                  }}
                  label={
                    <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
                      {OUTBOUND_VIEW_LABELS[option]}
                      <span
                        className='min-w-4 text-left tabular-nums text-quaternary-token'
                        data-testid={`outbound-count-${option}`}
                      >
                        {queue ? queue.counts[option] : ''}
                      </span>
                    </span>
                  }
                />
              ))}
            </div>
          }
          end={
            <>
              <span
                className={cn(
                  PAGE_TOOLBAR_META_TEXT_CLASS,
                  'min-w-24 text-right'
                )}
                data-testid='outbound-bulk-count'
              >
                {bulk.size ? `${bulk.size} selected · h hold · r reject` : ''}
              </span>
              <PageToolbarTabButton
                active={showReadiness}
                onClick={() => setShowReadiness(current => !current)}
                label={
                  <span
                    className='whitespace-nowrap tabular-nums'
                    data-testid='outbound-readiness-toggle'
                  >
                    Readiness{' '}
                    {readiness.data
                      ? `${readiness.data.ready}/${readiness.data.total}`
                      : ''}
                  </span>
                }
              />
              <PageToolbarActionButton
                label='Refresh'
                ariaLabel='Refresh Outbound'
                tooltipLabel={
                  queue
                    ? `Refresh · updated ${formatTimeAgo(queue.generatedAt)}`
                    : 'Refresh'
                }
                iconOnly
                disabled={query.isFetching}
                onClick={() => {
                  void query.refetch();
                  void readiness.refetch();
                }}
                icon={
                  <RefreshCw
                    className={cn(
                      'h-3.5 w-3.5',
                      query.isFetching && 'motion-safe:animate-spin'
                    )}
                  />
                }
              />
            </>
          }
        />
        {showReadiness ? (
          <div className='max-h-96 min-h-0 overflow-y-auto border-b border-(--app-shell-frame-seam)'>
            <OutboundReadinessPanel
              readiness={readiness.data}
              isLoading={readiness.isLoading}
              isError={readiness.isError}
            />
          </div>
        ) : null}
        <AdminTableShell testId='ovie-outbound-table'>
          {() => (
            <AdminDataTable
              data={rows}
              columns={columns}
              isLoading={query.isLoading}
              skeletonRows={10}
              minWidth='760px'
              getRowId={row => row.leadId}
              getRowClassName={getRowClassName}
              getRowTestId={row => `outbound-row-${row.leadId}`}
              onRowClick={row => {
                setSelectedId(row.leadId);
                setFocusedIndex(rows.indexOf(row));
              }}
              focusedRowIndex={focusedIndex}
              onFocusedRowChange={index => {
                setFocusedIndex(index);
                setSelectedId(rows[index]?.leadId ?? null);
              }}
              emptyState={emptyState}
            />
          )}
        </AdminTableShell>
        <p className='border-t border-(--app-shell-frame-seam) px-3 py-1.5 text-2xs text-tertiary-token'>
          j/k person · [/] fact · y/n/u answer fact · a approve message · h hold
          · r reject · x select. Approving records your decision; nothing sends
          automatically.
        </p>
      </div>
    </PageShell>
  );
}
