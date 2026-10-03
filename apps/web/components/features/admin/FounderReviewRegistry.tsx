'use client';

// @coverage-via apps/web/tests/unit/components/admin/FounderReviewRegistry.test.tsx
import { Button } from '@jovie/ui';
import {
  Check,
  CheckCircle2,
  CircleDashed,
  FilePenLine,
  Search,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import {
  DrawerSection,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import {
  MediaCanvasViewer,
  MediaThumb,
} from '@/components/organisms/media-canvas/MediaCanvasViewer';
import { TableEmptyState } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type {
  FounderReviewItem,
  FounderReviewRegistryKind,
} from '@/lib/admin/types';
import type {
  OvieCertificationDecisionKind,
  OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import {
  getCertificationDecisionErrorMessage,
  useOvieCertificationDecisionMutation,
  useOvieCertificationsQuery,
} from '@/lib/queries/useOvieCertificationsQuery';
import type { ColumnDef } from '@/lib/tanstack-table';

type ReviewOutcome = 'certified' | 'needs-work';
type RegistryFilter = 'all' | 'ready' | ReviewOutcome;

/**
 * Non-authoritative local drafts. Legacy `ovie-founder-review-decisions-v1`
 * marks load through the same shape: they are never presented as approvals
 * and must be re-confirmed against current server evidence to count.
 */
interface ReviewDraft {
  readonly outcome: ReviewOutcome;
  readonly note: string;
  readonly draftedAt: string;
  /** JOV-5753 deterministic evidence digest the draft was recorded against. */
  readonly evidenceDigest: string;
}

type ReviewDraftMap = Readonly<Record<string, ReviewDraft>>;

interface FounderReviewRegistryProps {
  readonly kind: FounderReviewRegistryKind;
  readonly items: readonly FounderReviewItem[];
}

const LOCAL_DRAFT_STORAGE_KEY = 'ovie-founder-review-decisions-v1';

const OUTCOME_TO_DECISION: Record<
  ReviewOutcome,
  OvieCertificationDecisionKind
> = {
  certified: 'approved',
  'needs-work': 'changes_requested',
};

function isReviewDraft(value: unknown): value is ReviewDraft {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ReviewDraft & { reviewedAt: string }>;
  const outcome = candidate.outcome;
  return (
    (outcome === 'certified' || outcome === 'needs-work') &&
    typeof candidate.note === 'string' &&
    typeof candidate.evidenceDigest === 'string' &&
    (typeof candidate.draftedAt === 'string' ||
      typeof candidate.reviewedAt === 'string')
  );
}

/** Legacy marks used `reviewedAt`; normalize both into the draft shape. */
function toDraft(value: ReviewDraft & { reviewedAt?: string }): ReviewDraft {
  return {
    outcome: value.outcome,
    note: value.note,
    draftedAt: value.draftedAt ?? value.reviewedAt ?? '',
    evidenceDigest: value.evidenceDigest,
  };
}

function loadReviewDrafts(): ReviewDraftMap {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY) ?? 'null'
    );
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, ReviewDraft] =>
          isReviewDraft(entry[1])
        )
        .map(([id, draft]) => [id, toDraft(draft)])
    );
  } catch {
    return {};
  }
}

function scopeLabel(item: FounderReviewItem): string {
  if (item.scope === 'component') return 'Component';
  return item.scope[0].toUpperCase() + item.scope.slice(1);
}

/** The authoritative server projection for one registry item, if connected. */
function rowForItem(
  item: FounderReviewItem,
  rowsBySubject: ReadonlyMap<string, OvieCertificationRow>
): OvieCertificationRow | undefined {
  return rowsBySubject.get(item.id);
}

/**
 * The authoritative decision bound to the item's current evidence digest.
 * `currentDecision` is digest-bound server-side, so changed evidence clears
 * the mark here without erasing the ledger's history.
 */
function authoritativeOutcome(
  item: FounderReviewItem,
  rowsBySubject: ReadonlyMap<string, OvieCertificationRow>
): ReviewOutcome | undefined {
  const kind = rowForItem(item, rowsBySubject)?.decision.currentDecision?.kind;
  if (kind === 'approved') return 'certified';
  if (kind === 'changes_requested' || kind === 'rejected') return 'needs-work';
  return undefined;
}

function draftForItem(
  item: FounderReviewItem,
  drafts: ReviewDraftMap,
  rowsBySubject: ReadonlyMap<string, OvieCertificationRow>
): ReviewDraft | undefined {
  if (authoritativeOutcome(item, rowsBySubject) !== undefined) {
    return undefined;
  }
  const draft = drafts[item.id];
  return draft?.evidenceDigest === item.decisionEvidenceDigest
    ? draft
    : undefined;
}

const MARK_TOKENS = {
  certified: ['size-3', Check, 'Certified', 'text-success'],
  'needs-work': ['size-3', XCircle, 'Needs Work', 'text-warning'],
  ready: ['size-3', CheckCircle2, 'Ready', 'text-success'],
  collecting: ['size-3', CircleDashed, 'Collecting', 'text-secondary-token'],
} as const;

function DecisionMark({
  item,
  outcome,
  draft,
}: Readonly<{
  item: FounderReviewItem;
  outcome?: ReviewOutcome;
  draft?: ReviewDraft;
}>) {
  if (draft) {
    return (
      <span className='inline-flex items-center gap-1 text-2xs text-tertiary-token'>
        <FilePenLine className='size-3' aria-hidden='true' />
        {`Draft · ${draft.outcome === 'certified' ? 'Certified' : 'Needs Work'}`}
      </span>
    );
  }
  const [size, Icon, label, tone] = MARK_TOKENS[outcome ?? item.readiness];
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
  const query = useOvieCertificationsQuery();
  const decision = useOvieCertificationDecisionMutation();
  const [filter, setFilter] = useState<RegistryFilter>('all');
  const [selectedId, setSelectedId] = useState(
    items.find(item => item.readiness === 'ready')?.id ?? items[0]?.id ?? ''
  );
  const [drafts, setDrafts] = useState<ReviewDraftMap>({});
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [note, setNote] = useState('');
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<ReviewOutcome | null>(
    null
  );
  const [decisionError, setDecisionError] = useState<string | null>(null);

  /** Authoritative state: feature-registry rows from the unified inventory. */
  const rowsBySubject = useMemo(() => {
    const map = new Map<string, OvieCertificationRow>();
    for (const row of query.data?.rows ?? []) {
      if (row.domain === 'feature_registry') map.set(row.subject.id, row);
    }
    return map;
  }, [query.data]);

  const persistDrafts = useCallback(
    (
      update: ReviewDraftMap | ((current: ReviewDraftMap) => ReviewDraftMap)
    ) => {
      setDrafts(update);
    },
    []
  );

  useEffect(() => {
    persistDrafts(loadReviewDrafts());
    setDraftsLoaded(true);
  }, [persistDrafts]);

  useEffect(() => {
    if (!draftsLoaded) return;
    try {
      localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      // The current screen remains usable when local persistence is blocked.
    }
  }, [drafts, draftsLoaded]);

  // Prune drafts whose evidence digest no longer matches the item's packet or
  // that an authoritative server decision has superseded.
  useEffect(() => {
    const itemById = new Map(items.map(item => [item.id, item]));
    const stale = Object.keys(drafts).filter(itemId => {
      const item = itemById.get(itemId);
      return (
        item &&
        draftForItem(item, { [itemId]: drafts[itemId] }, rowsBySubject) ===
          undefined
      );
    });
    if (stale.length === 0) return;
    persistDrafts(current => {
      const next = { ...current };
      for (const itemId of stale) {
        const item = itemById.get(itemId);
        if (item && draftForItem(item, current, rowsBySubject) === undefined)
          delete next[itemId];
      }
      return next;
    });
  }, [drafts, items, rowsBySubject, persistDrafts]);

  const behaviorCount = useMemo(
    () => items.filter(item => item.scope === 'behavior').length,
    [items]
  );

  const filteredItems = useMemo(
    () =>
      items.filter(item => {
        if (filter === 'all') return true;
        if (filter === 'ready') return item.readiness === 'ready';
        return authoritativeOutcome(item, rowsBySubject) === filter;
      }),
    [filter, items, rowsBySubject]
  );

  useEffect(() => {
    if (!filteredItems.some(item => item.id === selectedId)) {
      setSelectedId(filteredItems[0]?.id ?? '');
    }
  }, [filteredItems, selectedId]);

  useEffect(() => {
    setDecisionError(null);
  }, [selectedId]);

  const selected =
    filteredItems.find(item => item.id === selectedId) ??
    filteredItems[0] ??
    null;
  const selectedRow = selected ? rowForItem(selected, rowsBySubject) : null;
  const selectedOutcome = selected
    ? authoritativeOutcome(selected, rowsBySubject)
    : undefined;
  const selectedDraft = selected
    ? draftForItem(selected, drafts, rowsBySubject)
    : undefined;
  const selectedDecision = selectedRow?.decision.currentDecision ?? null;

  const recordDecision = useCallback(
    async (outcome: ReviewOutcome) => {
      if (!selected || !selectedRow) return;
      const availability = selectedRow.decision;
      if (!availability.available || !availability.evidenceDigest) return;
      const kind = OUTCOME_TO_DECISION[outcome];
      const notes = note.trim();
      // Request-changes needs the founder's reason; the server enforces it too.
      if (kind === 'changes_requested' && notes.length === 0) return;

      const draft: ReviewDraft = {
        outcome,
        note: notes,
        draftedAt: new Date().toISOString(),
        evidenceDigest: availability.evidenceDigest,
      };
      persistDrafts(current => ({ ...current, [selected.id]: draft }));
      setPendingOutcome(outcome);
      setDecisionError(null);
      try {
        await decision.mutateAsync({
          rowId: selectedRow.id,
          evidenceDigest: availability.evidenceDigest,
          decision: kind,
          notes: notes.length > 0 ? notes : null,
          actionId: crypto.randomUUID(),
        });
        persistDrafts(current => {
          const { [selected.id]: _cleared, ...next } = current;
          return next;
        });
        setNote('');
      } catch (error) {
        setDecisionError(getCertificationDecisionErrorMessage(error));
      } finally {
        setPendingOutcome(null);
      }
    },
    [decision, note, persistDrafts, selected, selectedRow]
  );

  const clearDraft = useCallback(() => {
    if (!selected) return;
    persistDrafts(current => {
      const { [selected.id]: _removed, ...next } = current;
      return next;
    });
  }, [persistDrafts, selected]);

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
            outcome={authoritativeOutcome(row.original, rowsBySubject)}
            draft={draftForItem(row.original, drafts, rowsBySubject)}
          />
        ),
      },
    ];
  }, [drafts, kind, rowsBySubject]);

  const detailPanel = useMemo(() => {
    if (!selected) return null;
    const media = selected.media[0];
    const canDecide = Boolean(
      selectedRow?.decision.available && !pendingOutcome
    );
    const decisionsConnected = !query.isError;
    const needsWorkReady = note.trim().length > 0;

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
                <span className='text-tertiary-token'>
                  {selectedDecision || !canDecide
                    ? '(optional)'
                    : '(required for Needs Work)'}
                </span>
              </span>
              <textarea
                value={note}
                onChange={event => setNote(event.target.value)}
                rows={2}
                disabled={!canDecide}
                placeholder={
                  canDecide
                    ? 'What should stay true or change?'
                    : 'Available when the review packet is ready.'
                }
                className='w-full resize-none rounded-lg border border-(--app-shell-border) bg-surface-1 px-3 py-2 text-xs text-primary-token outline-none placeholder:text-tertiary-token focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'
              />
            </label>
            <div className='flex flex-wrap items-center justify-end gap-2'>
              {selectedDecision ? null : (
                <>
                  <Button
                    size='sm'
                    variant='secondary'
                    disabled={!canDecide || !needsWorkReady}
                    onClick={() => void recordDecision('needs-work')}
                  >
                    Needs Work
                  </Button>
                  <Button
                    size='sm'
                    disabled={!canDecide}
                    onClick={() => void recordDecision('certified')}
                    data-testid='certify-review-item'
                  >
                    {pendingOutcome ? 'Recording…' : 'Certify For Taste'}
                  </Button>
                </>
              )}
              {selectedDraft ? (
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={clearDraft}
                  data-testid='discard-review-draft'
                >
                  Discard Draft
                </Button>
              ) : null}
            </div>
            <div
              className='min-h-4 text-2xs text-tertiary-token'
              aria-live='polite'
            >
              {decisionError ??
                (selectedDecision
                  ? `${selectedDecision.kind === 'approved' ? 'Certified' : 'Needs Work'} · ${new Date(selectedDecision.decidedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${selectedDecision.reviewer}${selectedDecision.notes ? ` · ${selectedDecision.notes}` : ''}`
                  : selectedDraft
                    ? 'Local draft only — not recorded. It cannot certify this item.'
                    : !decisionsConnected
                      ? 'Authoritative decisions are unavailable; retry when the certification service recovers.'
                      : (selectedRow?.decision.reason ??
                        'Decisions record against the shared certification ledger.'))}
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
                  onClick={() => setViewerIndex(0)}
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
                        onClick={() => setViewerIndex(i)}
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
              <DecisionMark
                item={selected}
                outcome={selectedOutcome}
                draft={selectedDraft}
              />
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
  }, [
    clearDraft,
    decisionError,
    note,
    pendingOutcome,
    query.isError,
    recordDecision,
    selected,
    selectedDecision,
    selectedDraft,
    selectedOutcome,
    selectedRow,
  ]);

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
              setViewerIndex(null);
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

      <MediaCanvasViewer
        items={selected?.media ?? []}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </div>
  );
}
