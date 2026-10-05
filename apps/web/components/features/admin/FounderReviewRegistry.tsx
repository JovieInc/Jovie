'use client';

// @coverage-via apps/web/tests/unit/components/admin/FounderReviewRegistry.test.tsx
import { Button } from '@jovie/ui';
import {
  Check,
  CheckCircle2,
  CircleDashed,
  Search,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import {
  DrawerSection,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { MediaThumb } from '@/components/organisms/media-canvas/MediaCanvasViewer';
import {
  closeMediaCanvas,
  openMediaCanvas,
} from '@/components/organisms/media-canvas/media-canvas-state';
import { TableEmptyState } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type {
  FounderReviewItem,
  FounderReviewRegistryKind,
} from '@/lib/admin/types';
import type { ColumnDef } from '@/lib/tanstack-table';

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
    const parsed: unknown = JSON.parse(
      localStorage.getItem(LOCAL_REVIEW_STORAGE_KEY) ?? 'null'
    );
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

const MARK_TOKENS = {
  certified: ['size-3', Check, 'Certified', 'text-success'],
  'needs-work': ['size-3', XCircle, 'Needs Work', 'text-warning'],
  ready: ['size-3', CheckCircle2, 'Ready', 'text-success'],
  collecting: ['size-3', CircleDashed, 'Collecting', 'text-secondary-token'],
} as const;

function DecisionMark({
  item,
  decision,
}: Readonly<{
  item: FounderReviewItem;
  decision?: ReviewDecision;
}>) {
  const [size, Icon, label, tone] =
    MARK_TOKENS[decision?.outcome ?? item.readiness];
  return (
    <span className={`inline-flex items-center gap-1 text-2xs ${tone}`}>
      <Icon className={size} aria-hidden='true' />
      {label}
    </span>
  );
}

export function FounderReviewRegistry({
  kind,
  items,
}: Readonly<FounderReviewRegistryProps>) {
  const [filter, setFilter] = useState<RegistryFilter>('all');
  const [selectedId, setSelectedId] = useState(
    items.find(item => item.readiness === 'ready')?.id ?? items[0]?.id ?? ''
  );
  const [decisions, setDecisions] = useState<ReviewDecisionMap>({});
  const [note, setNote] = useState('');

  const persistDecisions = useCallback((next: ReviewDecisionMap) => {
    setDecisions(next);
    try {
      localStorage.setItem(LOCAL_REVIEW_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The current screen remains usable when local persistence is blocked.
    }
  }, []);

  useEffect(() => {
    persistDecisions(loadReviewDecisions());
  }, [persistDecisions]);

  // Prune decisions whose evidence digest no longer matches the item's packet.
  useEffect(() => {
    const itemById = new Map(items.map(item => [item.id, item]));
    const stale = Object.keys(decisions).filter(itemId => {
      const item = itemById.get(itemId);
      return (
        item &&
        validDecisionForItem(item, { [itemId]: decisions[itemId] }) ===
          undefined
      );
    });
    if (stale.length === 0) return;
    const next = { ...decisions };
    for (const itemId of stale) delete next[itemId];
    persistDecisions(next);
  }, [decisions, items, persistDecisions]);

  const behaviorCount = useMemo(
    () => items.filter(item => item.scope === 'behavior').length,
    [items]
  );

  const filteredItems = useMemo(
    () =>
      items.filter(item => {
        if (filter === 'all') return true;
        if (filter === 'ready') return item.readiness === 'ready';
        return validDecisionForItem(item, decisions)?.outcome === filter;
      }),
    [decisions, filter, items]
  );

  useEffect(() => {
    if (!filteredItems.some(item => item.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? '');
    }
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
    const { [selected.id]: _removed, ...next } = decisions;
    persistDecisions(next);
  }, [decisions, persistDecisions, selected]);

  const columns = useMemo<ColumnDef<FounderReviewItem, unknown>[]>(() => {
    const text = (
      id: string,
      header: string,
      size: number,
      read: (item: FounderReviewItem) => string
    ): ColumnDef<FounderReviewItem, unknown> => ({
      id,
      accessorFn: read,
      header,
      size,
      cell: ({ row }) => (
        <span className='line-clamp-1 text-2xs text-secondary-token'>
          {read(row.original)}
        </span>
      ),
    });
    return [
      {
        id: 'item',
        accessorFn: item => item.title,
        header: 'Registry Item',
        size: 310,
        cell: ({ row }) => (
          <span
            className='truncate text-xs font-medium text-primary-token'
            title={row.original.description}
          >
            {row.original.title}
          </span>
        ),
      },
      text('scope', 'Level', 90, scopeLabel),
      text('area', kind === 'feature' ? 'Area' : 'Layer', 130, i => i.eyebrow),
      text('status', 'Product Status', 120, i => i.status),
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
    ];
  }, [decisions, kind]);

  const detailPanel = useMemo(() => {
    if (!selected) return null;
    const media = selected.media[0];
    const canCertify = selected.readiness === 'ready';

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
          <div className='space-y-2'>
            <label className='block'>
              <span className='mb-1.5 block text-2xs font-medium text-primary-token'>
                Founder note{' '}
                <span className='text-tertiary-token'>(optional)</span>
              </span>
              <textarea
                value={note}
                onChange={event => setNote(event.target.value)}
                rows={2}
                disabled={!canCertify}
                placeholder={
                  canCertify
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
                    disabled={!canCertify}
                    onClick={() => recordDecision('needs-work')}
                  >
                    Needs Work
                  </Button>
                  <Button
                    size='sm'
                    disabled={!canCertify}
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
              {selectedDecision
                ? `${selectedDecision.outcome === 'certified' ? 'Certified' : 'Needs Work'} · ${new Date(selectedDecision.reviewedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${selectedDecision.note ? ` · ${selectedDecision.note}` : ''}`
                : 'Local founder-review record only; this does not imply CI, deploy, or runtime certification.'}
            </div>
          </div>
        }
      >
        <div className='space-y-3 px-3 pt-3'>
          <div data-testid='founder-review-evidence-media'>
            {selected.media.length > 0 ? (
              <>
                <button
                  type='button'
                  onClick={() => openMediaCanvas(selected.media, 0)}
                  aria-label={`Open ${media?.alt ?? selected.title}`}
                  className='relative block aspect-video w-full overflow-hidden rounded-lg border border-(--app-shell-border) bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                >
                  {media ? <MediaThumb item={media} fit='contain' /> : null}
                </button>
                {selected.media.length > 1 ? (
                  <div className='mt-2 grid grid-cols-4 gap-1.5'>
                    {selected.media.map((item, i) => (
                      <button
                        key={item.src}
                        type='button'
                        onClick={() => openMediaCanvas(selected.media, i)}
                        aria-label={`Open ${item.alt}`}
                        className='relative aspect-video overflow-hidden rounded-md border border-(--app-shell-border) bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      >
                        <MediaThumb item={item} />
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className='mt-1.5 flex items-center justify-between gap-2 text-2xs text-tertiary-token'>
                  <span className='min-w-0 truncate'>{media?.label}</span>
                  <span className='shrink-0'>
                    {selected.media.length > 1
                      ? `${selected.media.length} items`
                      : media?.dedicated
                        ? 'Item-specific'
                        : 'Context only'}
                  </span>
                </div>
              </>
            ) : (
              <p className='rounded-lg border border-dashed border-(--app-shell-border) px-3 py-6 text-center text-2xs text-tertiary-token'>
                No evidence captured yet
              </p>
            )}
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
            <dl className='flex flex-col gap-y-2 text-2xs'>
              {[
                ['Status', selected.status],
                ['Access', selected.access],
                ['Gate', selected.gate],
                ['Source', selected.source],
              ].map(([label, value]) => (
                <div key={label} className='flex gap-3'>
                  <dt className='w-20 shrink-0 text-tertiary-token'>{label}</dt>
                  <dd className='min-w-0 flex-1 break-words text-secondary-token'>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </DrawerSection>

          <DrawerSection title='Evidence'>
            <ul className='list-disc space-y-1 pl-4 text-2xs text-secondary-token marker:text-tertiary-token'>
              {[
                ...selected.certificationPacket.canonicalReferences,
                ...selected.certificationPacket.invariantEvaluation,
                ...selected.certificationPacket.testsCoverage,
              ].map(receipt => (
                <li key={receipt.id}>{receipt.summary}</li>
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
  }, [note, recordDecision, reopenSelected, selected, selectedDecision]);

  useRegisterRightPanel(detailPanel);

  return (
    <div className='space-y-4' data-testid={`${kind}-review-registry`}>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end'>
        <AppSegmentControl<RegistryFilter>
          aria-label='Registry Filter'
          value={filter}
          onValueChange={setFilter}
          layout='hug'
          size='sm'
          options={[
            { value: 'all', label: 'All' },
            { value: 'ready', label: 'Ready' },
            { value: 'certified', label: 'Certified' },
            { value: 'needs-work', label: 'Needs Work' },
          ]}
        />
      </div>

      {kind === 'feature' ? (
        <p className='text-2xs text-tertiary-token'>
          {behaviorCount} source-audited atomic behavior · inventory
          intentionally incomplete
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
              closeMediaCanvas();
            }}
            isRowSelected={item => item.id === selected?.id}
            getRowTestId={item => `founder-review-row-${item.id}`}
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
