'use client';

import { Button } from '@jovie/ui';
import {
  Check,
  CheckCircle2,
  CircleDashed,
  Search,
  XCircle,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DrawerSection,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { TableEmptyState } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type {
  FounderReviewItem,
  FounderReviewRegistryKind,
} from '@/lib/admin/types';
import type { ColumnDef } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';

type ReviewOutcome = 'certified' | 'needs-work';
type RegistryFilter = 'all' | 'ready' | ReviewOutcome;

interface ReviewDecision {
  readonly outcome: ReviewOutcome;
  readonly note: string;
  readonly reviewedAt: string;
  /** JOV-5753 deterministic evidence digest the decision was recorded against. */
  readonly evidenceDigest: string;
}

type ReviewDecisionMap = Readonly<Record<string, ReviewDecision>>;

interface FounderReviewRegistryProps {
  readonly kind: FounderReviewRegistryKind;
  readonly items: readonly FounderReviewItem[];
}

const LOCAL_REVIEW_STORAGE_KEY = 'ovie-founder-review-decisions-v1';

function isReviewDecision(value: unknown): value is ReviewDecision {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ReviewDecision>;
  return (
    (candidate.outcome === 'certified' || candidate.outcome === 'needs-work') &&
    typeof candidate.note === 'string' &&
    typeof candidate.reviewedAt === 'string' &&
    typeof candidate.evidenceDigest === 'string'
  );
}

function loadReviewDecisions(): ReviewDecisionMap {
  try {
    const raw = localStorage.getItem(LOCAL_REVIEW_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, ReviewDecision] => isReviewDecision(entry[1])
      )
    );
  } catch {
    return {};
  }
}

function formatReviewDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Recorded locally';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function scopeLabel(item: FounderReviewItem): string {
  if (item.scope === 'component') return 'Component';
  return item.scope[0].toUpperCase() + item.scope.slice(1);
}

function validDecisionForItem(
  item: FounderReviewItem,
  decisions: ReviewDecisionMap
): ReviewDecision | undefined {
  const decision = decisions[item.id];
  if (
    item.readiness !== 'ready' ||
    decision?.evidenceDigest !== item.decisionEvidenceDigest
  ) {
    return undefined;
  }
  return decision;
}

function ReadinessMark({ item }: Readonly<{ item: FounderReviewItem }>) {
  if (item.readiness === 'ready') {
    return (
      <span className='inline-flex items-center gap-1 text-2xs text-success'>
        <CheckCircle2 className='size-3' aria-hidden='true' />
        Ready
      </span>
    );
  }

  return (
    <span className='inline-flex items-center gap-1 text-2xs text-secondary-token'>
      <CircleDashed className='size-3' aria-hidden='true' />
      Collecting
    </span>
  );
}

function DecisionMark({
  item,
  decision,
}: Readonly<{
  item: FounderReviewItem;
  decision?: ReviewDecision;
}>) {
  if (decision?.outcome === 'certified') {
    return (
      <span className='inline-flex items-center gap-1 text-2xs text-success'>
        <Check className='size-3' aria-hidden='true' />
        Certified
      </span>
    );
  }
  if (decision?.outcome === 'needs-work') {
    return (
      <span className='inline-flex items-center gap-1 text-2xs text-warning'>
        <XCircle className='size-3' aria-hidden='true' />
        Needs Work
      </span>
    );
  }
  return <ReadinessMark item={item} />;
}

export function FounderReviewRegistry({
  kind,
  items,
}: Readonly<FounderReviewRegistryProps>) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RegistryFilter>('all');
  const [selectedId, setSelectedId] = useState(
    items.find(item => item.readiness === 'ready')?.id ?? items[0]?.id ?? ''
  );
  const [decisions, setDecisions] = useState<ReviewDecisionMap>({});
  const [note, setNote] = useState('');
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const loaded = loadReviewDecisions();
    setDecisions(loaded);
    try {
      localStorage.setItem(LOCAL_REVIEW_STORAGE_KEY, JSON.stringify(loaded));
    } catch {
      // Invalid legacy records remain ignored when storage is unavailable.
    }
    setStorageReady(true);
  }, []);

  const persistDecisions = useCallback((next: ReviewDecisionMap) => {
    setDecisions(next);
    try {
      localStorage.setItem(LOCAL_REVIEW_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The current screen remains usable when local persistence is blocked.
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const itemById = new Map(items.map(item => [item.id, item]));
    const next: Record<string, ReviewDecision> = { ...decisions };
    let removedStaleDecision = false;

    for (const [itemId, decision] of Object.entries(decisions)) {
      const item = itemById.get(itemId);
      if (
        item &&
        validDecisionForItem(item, { [itemId]: decision }) === undefined
      ) {
        delete next[itemId];
        removedStaleDecision = true;
      }
    }

    if (removedStaleDecision) persistDecisions(next);
  }, [decisions, items, persistDecisions, storageReady]);

  const counts = useMemo(() => {
    const ready = items.filter(item => item.readiness === 'ready').length;
    const certified = items.filter(
      item => validDecisionForItem(item, decisions)?.outcome === 'certified'
    ).length;
    const needsWork = items.filter(
      item => validDecisionForItem(item, decisions)?.outcome === 'needs-work'
    ).length;
    const behaviors = items.filter(item => item.scope === 'behavior').length;
    return { ready, certified, needsWork, behaviors };
  }, [decisions, items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter(item => {
      const matchesQuery =
        !normalizedQuery ||
        `${item.title} ${item.eyebrow} ${item.description} ${item.scope}`
          .toLowerCase()
          .includes(normalizedQuery);
      if (!matchesQuery) return false;
      if (filter === 'all') return true;
      if (filter === 'ready') return item.readiness === 'ready';
      return validDecisionForItem(item, decisions)?.outcome === filter;
    });
  }, [decisions, filter, items, query]);

  useEffect(() => {
    if (filteredItems.some(item => item.id === selectedId)) return;
    setSelectedId(filteredItems[0]?.id ?? '');
  }, [filteredItems, selectedId]);

  const selected =
    filteredItems.find(item => item.id === selectedId) ??
    filteredItems[0] ??
    null;
  const selectedDecision = selected
    ? validDecisionForItem(selected, decisions)
    : undefined;

  const recordDecision = useCallback(
    (outcome: ReviewOutcome) => {
      if (!selected || selected.readiness !== 'ready') return;
      persistDecisions({
        ...decisions,
        [selected.id]: {
          outcome,
          note: note.trim(),
          reviewedAt: new Date().toISOString(),
          evidenceDigest: selected.decisionEvidenceDigest,
        },
      });
      setNote('');
    },
    [decisions, note, persistDecisions, selected]
  );

  const reopenSelected = useCallback(() => {
    if (!selected) return;
    const next = { ...decisions };
    delete next[selected.id];
    persistDecisions(next);
  }, [decisions, persistDecisions, selected]);

  const columns = useMemo<ColumnDef<FounderReviewItem, unknown>[]>(
    () => [
      {
        id: 'item',
        accessorFn: item => item.title,
        header: 'Registry Item',
        size: 310,
        cell: ({ row }) => (
          <div className='min-w-0 py-0.5'>
            <div className='truncate text-xs font-medium text-primary-token'>
              {row.original.title}
            </div>
            <div className='truncate text-2xs text-tertiary-token'>
              {row.original.description}
            </div>
          </div>
        ),
      },
      {
        id: 'scope',
        accessorFn: item => item.scope,
        header: 'Level',
        size: 90,
        cell: ({ row }) => (
          <span className='text-2xs text-secondary-token'>
            {scopeLabel(row.original)}
          </span>
        ),
      },
      {
        id: 'area',
        accessorFn: item => item.eyebrow,
        header: kind === 'feature' ? 'Area' : 'Layer',
        size: 130,
        cell: ({ row }) => (
          <span className='line-clamp-1 text-2xs text-secondary-token'>
            {row.original.eyebrow}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: item => item.status,
        header: 'Product Status',
        size: 120,
        cell: ({ row }) => (
          <span className='line-clamp-1 text-2xs text-secondary-token'>
            {row.original.status}
          </span>
        ),
      },
      {
        id: 'review',
        header: 'Review',
        size: 110,
        cell: ({ row }) => (
          <DecisionMark
            item={row.original}
            decision={validDecisionForItem(row.original, decisions)}
          />
        ),
      },
    ],
    [decisions, kind]
  );

  const detailPanel = useMemo(() => {
    if (!selected) return null;
    const media = selected.media[0];
    const reviewStatus = selectedDecision && storageReady;

    return (
      <EntitySidebarShell
        isOpen
        ariaLabel={`${selected.title} certification details`}
        title={selected.title}
        headerMode='minimal'
        scrollStrategy='shell'
        workspaceSurface='flat'
        footerSurface='flat'
        data-testid='founder-review-detail-rail'
        footer={
          <div className='space-y-2.5'>
            <label className='block'>
              <span className='mb-1.5 block text-2xs font-medium text-primary-token'>
                Founder note{' '}
                <span className='text-tertiary-token'>(optional)</span>
              </span>
              <textarea
                value={note}
                onChange={event => setNote(event.target.value)}
                rows={2}
                disabled={selected.readiness !== 'ready'}
                placeholder={
                  selected.readiness === 'ready'
                    ? 'What should stay true or change?'
                    : 'Available when the review packet is ready.'
                }
                className='w-full resize-none rounded-lg border border-(--app-shell-border) bg-surface-1 px-3 py-2 text-xs text-primary-token outline-none placeholder:text-tertiary-token focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'
              />
            </label>
            <div className='flex flex-wrap items-center justify-end gap-2'>
              {selectedDecision ? (
                <Button size='sm' variant='secondary' onClick={reopenSelected}>
                  Reopen Review
                </Button>
              ) : (
                <>
                  <Button
                    size='sm'
                    variant='secondary'
                    disabled={selected.readiness !== 'ready'}
                    onClick={() => recordDecision('needs-work')}
                  >
                    Needs Work
                  </Button>
                  <Button
                    size='sm'
                    disabled={selected.readiness !== 'ready'}
                    onClick={() => recordDecision('certified')}
                    data-testid='certify-review-item'
                  >
                    Certify For Taste
                  </Button>
                </>
              )}
            </div>
            <div
              className='min-h-4 text-2xs text-tertiary-token'
              aria-live='polite'
            >
              {reviewStatus
                ? `${selectedDecision.outcome === 'certified' ? 'Certified' : 'Needs Work'} · ${formatReviewDate(selectedDecision.reviewedAt)}${selectedDecision.note ? ` · ${selectedDecision.note}` : ''}`
                : 'Local founder-review record only; this does not imply CI, deploy, or runtime certification.'}
            </div>
          </div>
        }
      >
        <div className='space-y-3'>
          <div data-testid='founder-review-evidence-media'>
            <div className='overflow-hidden rounded-lg border border-(--app-shell-border) bg-base'>
              {media?.kind === 'video' ? (
                <video
                  key={media.src}
                  controls
                  preload='metadata'
                  poster={media.poster}
                  className='aspect-video w-full object-contain'
                >
                  <source src={media.src} type='video/mp4' />
                  <track
                    kind='captions'
                    src='/demo/jovie-demo.vtt'
                    srcLang='en'
                    label='English'
                  />
                </video>
              ) : (
                <Image
                  key={media?.src}
                  src={media?.src ?? '/og/default.png'}
                  alt={media?.alt ?? selected.title}
                  width={1600}
                  height={900}
                  className='aspect-video w-full object-contain'
                  priority
                />
              )}
            </div>
            <div className='mt-1.5 flex items-center justify-between gap-2 text-2xs text-tertiary-token'>
              <span>{media?.label}</span>
              <span>{media?.dedicated ? 'Item-specific' : 'Context only'}</span>
            </div>
          </div>

          <div>
            <div className='flex items-start justify-between gap-2'>
              <div>
                <p className='text-2xs text-tertiary-token'>
                  {scopeLabel(selected)} · {selected.eyebrow}
                </p>
                <p className='mt-0.5 text-sm font-semibold text-primary-token'>
                  {selected.title}
                </p>
              </div>
              <DecisionMark item={selected} decision={selectedDecision} />
            </div>
            <p className='mt-2 text-xs leading-5 text-secondary-token'>
              {selected.description}
            </p>
          </div>

          <DrawerSection title='Certification details'>
            <dl className='grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-2xs'>
              {[
                ['Status', selected.status],
                ['Access', selected.access],
                ['Gate', selected.gate],
                ['Source', selected.source],
              ].map(([label, value]) => (
                <div key={label} className='contents'>
                  <dt className='text-tertiary-token'>{label}</dt>
                  <dd className='min-w-0 break-words text-secondary-token'>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </DrawerSection>

          <DrawerSection title='Evidence'>
            <ul className='space-y-1.5'>
              {selected.evidence.map(item => (
                <li
                  key={item}
                  className='flex items-center gap-2 text-2xs text-secondary-token'
                >
                  <span className='size-1.5 rounded-full bg-tertiary-token' />
                  {item}
                </li>
              ))}
            </ul>
          </DrawerSection>

          <div className='rounded-lg border border-(--app-shell-border) bg-surface-0 p-3'>
            <p className='text-2xs font-medium text-primary-token'>
              Review readiness
            </p>
            <p className='mt-1 text-2xs leading-4 text-secondary-token'>
              {selected.readinessReason}
            </p>
          </div>
        </div>
      </EntitySidebarShell>
    );
  }, [
    note,
    recordDecision,
    reopenSelected,
    selected,
    selectedDecision,
    storageReady,
  ]);

  useRegisterRightPanel(detailPanel);

  const metricRows: readonly (readonly [string, number])[] = [
    ['Ready now', counts.ready],
    ['Certified', counts.certified],
    ['Needs Work', counts.needsWork],
  ];

  return (
    <div className='space-y-4' data-testid={`${kind}-review-registry`}>
      <div className='grid grid-cols-3 divide-x divide-(--app-shell-border) overflow-hidden rounded-lg border border-(--app-shell-border) bg-surface-1'>
        {metricRows.map(([label, value]) => (
          <div key={label} className='px-3 py-2.5'>
            <p className='text-2xs text-tertiary-token'>{label}</p>
            <p className='mt-0.5 text-base font-semibold tabular-nums text-primary-token'>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <label className='relative min-w-0 flex-1'>
          <span className='sr-only'>Search registry</span>
          <Search className='pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-tertiary-token' />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder='Search registry'
            className='h-9 w-full rounded-lg border border-(--app-shell-border) bg-surface-1 pl-9 pr-3 text-xs text-primary-token outline-none placeholder:text-tertiary-token focus-visible:ring-2 focus-visible:ring-ring'
          />
        </label>
        <fieldset className='flex h-9 items-center gap-1 rounded-lg border border-(--app-shell-border) bg-surface-1 p-1'>
          <legend className='sr-only'>Registry filter</legend>
          {(['all', 'ready', 'certified', 'needs-work'] as const).map(value => (
            <button
              key={value}
              type='button'
              onClick={() => setFilter(value)}
              className={cn(
                'h-7 rounded-md px-2.5 text-2xs font-medium text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filter === value && 'bg-surface-2 text-primary-token'
              )}
              aria-pressed={filter === value}
            >
              {value === 'needs-work'
                ? 'Needs Work'
                : value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </fieldset>
      </div>

      {kind === 'feature' ? (
        <p className='text-2xs text-tertiary-token'>
          {counts.behaviors} source-audited atomic behavior · capability and
          behavior inventory is intentionally incomplete
        </p>
      ) : null}

      <AdminTableShell
        className='system-b-founder-review-table-shell overflow-hidden rounded-lg border border-(--app-shell-border) bg-surface-1'
        testId='founder-review-table'
      >
        {() => (
          <AdminDataTable<FounderReviewItem>
            data={[...filteredItems]}
            columns={columns}
            getRowId={item => item.id}
            onRowClick={item => {
              setSelectedId(item.id);
              setNote('');
            }}
            isRowSelected={item => item.id === selected?.id}
            getRowTestId={item => `founder-review-row-${item.id}`}
            rowHeight={48}
            minWidth='720px'
            className='system-b-founder-review-table'
            containerClassName='h-full'
            emptyState={
              <TableEmptyState
                icon={<Search className='size-5' aria-hidden='true' />}
                heading='No registry items found'
                description='Choose a broader filter or change the search query.'
              />
            }
          />
        )}
      </AdminTableShell>
    </div>
  );
}
