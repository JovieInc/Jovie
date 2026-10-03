'use client';

import { Kbd } from '@jovie/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  Inbox,
  type LucideIcon,
  Palette,
  Scale,
  Send,
} from 'lucide-react';
import {
  type PointerEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from '@/components/feedback';
import { EmptyState } from '@/components/molecules/EmptyState';
import { RouteSegmentControl } from '@/components/molecules/RouteSegmentControl';
import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbar,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  buildInboxDecisionRequest,
  decisionFromSwipe,
  formatInboxAmount,
  OVIE_INBOX_KIND_LABELS,
  OVIE_INBOX_PRODUCT_LABELS,
  type OvieInboxDecision,
  type OvieInboxItem,
  type OvieInboxKind,
  type OvieInboxResponse,
} from '@/lib/ovie/inbox';
import { queryKeys } from '@/lib/queries/keys';
import { useOvieInboxQuery } from '@/lib/queries/useOvieInboxQuery';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import { OvieInboxCommentDialog } from './OvieInboxCommentDialog';
import { OvieInboxDetail } from './OvieInboxDetail';

export type OvieInboxView = 'pending' | 'decided';

const KIND_GLYPHS: Record<OvieInboxKind, LucideIcon> = {
  outbound: Send,
  spend: DollarSign,
  taste: Palette,
  decision: Scale,
};

const ROW_CLASS = 'h-11';
const SKELETON_ROW_IDS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.closest('[role="dialog"]') !== null
  );
}

/** Apply a recorded decision to the shared cache (page + nav badge). */
function applyDecision(
  data: OvieInboxResponse,
  item: OvieInboxItem,
  decided: OvieInboxItem | null
): OvieInboxResponse {
  return {
    ...data,
    pending: data.pending.filter(entry => entry.key !== item.key),
    decided: decided
      ? [decided, ...data.decided.filter(entry => entry.key !== item.key)]
      : data.decided,
  };
}

function InboxRow({
  item,
  selected,
  onSelect,
  onSwipe,
}: Readonly<{
  item: OvieInboxItem;
  selected: boolean;
  onSelect: () => void;
  onSwipe: (decision: OvieInboxDecision) => void;
}>) {
  const Glyph = KIND_GLYPHS[item.kind];
  const startX = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== 'touch' || item.status !== 'pending') return;
    startX.current = event.clientX;
  }
  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (startX.current === null) return;
    setDragX(event.clientX - startX.current);
  }
  function onPointerEnd() {
    if (startX.current === null) return;
    const decision = decisionFromSwipe(dragX);
    startX.current = null;
    setDragX(0);
    if (decision) onSwipe(decision);
  }

  const meta = [
    OVIE_INBOX_PRODUCT_LABELS[item.product],
    item.amountUsd === null ? null : formatInboxAmount(item.amountUsd),
    formatTimeAgo(item.decidedAt ?? item.createdAt),
  ].filter(Boolean);

  return (
    <li className='border-b border-subtle'>
      <button
        type='button'
        onClick={onSelect}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        aria-current={selected ? 'true' : undefined}
        data-testid='ovie-inbox-row'
        data-key={item.key}
        style={
          dragX === 0 ? undefined : { transform: `translateX(${dragX}px)` }
        }
        className={cn(
          ROW_CLASS,
          'grid w-full touch-pan-y grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-2 px-3 text-left transition-colors duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/55',
          selected ? 'bg-surface-1' : 'hover:bg-surface-1/60'
        )}
      >
        <Glyph
          className='size-3.5 text-tertiary-token'
          aria-label={OVIE_INBOX_KIND_LABELS[item.kind]}
        />
        <span className='truncate text-app text-primary-token'>
          {item.title}
        </span>
        <span className='whitespace-nowrap text-xs tabular-nums text-tertiary-token'>
          {item.status === 'pending'
            ? null
            : `${item.status === 'approved' ? 'Approved' : 'Rejected'} · `}
          {meta.join(' · ')}
        </span>
      </button>
    </li>
  );
}

function InboxSkeleton() {
  return (
    <ul aria-busy='true' aria-label='Loading Inbox'>
      {SKELETON_ROW_IDS.map(id => (
        <li
          key={id}
          className={cn(
            ROW_CLASS,
            'flex items-center border-b border-subtle px-3'
          )}
        >
          <span className='h-3 w-2/5 animate-pulse rounded bg-surface-1' />
        </li>
      ))}
    </ul>
  );
}

export interface OvieInboxProps {
  readonly view: OvieInboxView;
  /** Server prefetch; null when the server read failed. */
  readonly initialData: OvieInboxResponse | null;
}

export function OvieInbox({ view, initialData }: Readonly<OvieInboxProps>) {
  const queryClient = useQueryClient();
  const query = useOvieInboxQuery({ initialData: initialData ?? undefined });
  const data = query.data;
  const items = useMemo(
    () => (view === 'pending' ? (data?.pending ?? []) : (data?.decided ?? [])),
    [data, view]
  );

  // undefined = follow the first card; null = rail closed by the founder.
  const [selectedKey, setSelectedKey] = useState<string | null | undefined>(
    undefined
  );
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [commentTarget, setCommentTarget] = useState<{
    readonly item: OvieInboxItem;
    readonly preset: OvieInboxDecision | null;
  } | null>(null);

  const foundIndex = items.findIndex(item => item.key === selectedKey);
  const selectedIndex = foundIndex === -1 ? 0 : foundIndex;
  const selected = selectedKey === null ? null : (items[selectedIndex] ?? null);

  const decide = useCallback(
    async (
      item: OvieInboxItem,
      decision: OvieInboxDecision,
      comment: string | null
    ) => {
      if (item.status !== 'pending' || submittingKey) return;
      const request = buildInboxDecisionRequest(item, decision, comment);
      if (!request) {
        setCommentTarget({ item, preset: decision });
        return;
      }

      const index = items.findIndex(entry => entry.key === item.key);
      const next = items[index + 1] ?? items[index - 1] ?? null;
      setSubmittingKey(item.key);
      try {
        const response = await fetch(request.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request.body),
        });
        if (!response.ok && response.status !== 409) {
          throw new Error(`Decision failed (${response.status})`);
        }
        const decidedItem: OvieInboxItem | null =
          item.source === 'summer'
            ? {
                ...item,
                status: decision === 'approve' ? 'approved' : 'rejected',
                comment: comment?.trim() || null,
                decidedAt: new Date().toISOString(),
              }
            : null;
        queryClient.setQueryData<OvieInboxResponse>(
          queryKeys.ovieInbox.all,
          current =>
            current ? applyDecision(current, item, decidedItem) : current
        );
        setSelectedKey(next?.key);
        toast.success(
          response.status === 409
            ? 'Already decided elsewhere.'
            : decision === 'approve'
              ? 'Approved.'
              : 'Rejected.'
        );
        if (response.status === 409) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.ovieInbox.all,
          });
        }
      } catch {
        toast.error('Decision not saved. The card is still here; try again.');
      } finally {
        setSubmittingKey(null);
      }
    },
    [items, queryClient, submittingKey]
  );

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (commentTarget || isEditableTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'j' || event.key === 'ArrowDown') {
      const next = selected
        ? items[Math.min(selectedIndex + 1, items.length - 1)]
        : items[0];
      if (next) setSelectedKey(next.key);
      event.preventDefault();
      return;
    }
    if (key === 'k' || event.key === 'ArrowUp') {
      const previous = items[Math.max(selectedIndex - 1, 0)];
      if (previous) setSelectedKey(previous.key);
      event.preventDefault();
      return;
    }
    if (!selected || selected.status !== 'pending') return;
    if (key === 'a') {
      event.preventDefault();
      void decide(selected, 'approve', null);
    } else if (key === 'r') {
      event.preventDefault();
      void decide(selected, 'reject', null);
    } else if (key === 'c') {
      event.preventDefault();
      setCommentTarget({ item: selected, preset: null });
    }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const detail = useMemo(
    () => (
      <OvieInboxDetail
        item={selected}
        isSubmitting={submittingKey !== null}
        onDecide={decision => {
          if (selected) void decide(selected, decision, null);
        }}
        onComment={() => {
          if (selected) setCommentTarget({ item: selected, preset: null });
        }}
        onClose={() => setSelectedKey(null)}
      />
    ),
    [decide, selected, submittingKey]
  );
  useRegisterRightPanel(detail);

  const pendingCount = data?.pending.length ?? 0;
  const degradedSources = data
    ? Object.entries(data.sources)
        .filter(([, health]) => health === 'error')
        .map(([source]) => (source === 'summer' ? 'Summer' : 'Design Lab'))
    : [];

  let body;
  if (!data && query.isPending) {
    body = <InboxSkeleton />;
  } else if (!data) {
    body = (
      <EmptyState
        icon={<Inbox className='h-5 w-5' aria-hidden='true' />}
        heading='Inbox did not load'
        description='Cards are safe. Retry to load them again.'
        action={{ label: 'Retry', onClick: () => void query.refetch() }}
        testId='ovie-inbox-error'
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={<Inbox className='h-5 w-5' aria-hidden='true' />}
        heading={view === 'pending' ? 'Inbox zero' : 'No decisions yet'}
        description={
          view === 'pending'
            ? 'Summer cards and taste proposals land here.'
            : 'Approved and rejected cards appear here.'
        }
        testId='ovie-inbox-empty'
      />
    );
  } else {
    body = (
      <ul aria-label={view === 'pending' ? 'Pending cards' : 'Decided cards'}>
        {items.map(item => (
          <InboxRow
            key={item.key}
            item={item}
            selected={item.key === selected?.key}
            onSelect={() => setSelectedKey(item.key)}
            onSwipe={decision => void decide(item, decision, null)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className='flex min-h-full flex-col' data-testid='ovie-inbox'>
      <PageToolbar
        start={
          <RouteSegmentControl
            aria-label='Inbox Filter'
            value={view}
            options={[
              {
                value: 'pending',
                label: pendingCount > 0 ? `Pending ${pendingCount}` : 'Pending',
                href: APP_ROUTES.ADMIN_INBOX,
              },
              {
                value: 'decided',
                label: 'Decided',
                href: `${APP_ROUTES.ADMIN_INBOX}?view=decided`,
              },
            ]}
          />
        }
        end={
          <span
            className={cn(
              PAGE_TOOLBAR_META_TEXT_CLASS,
              'hidden items-center gap-1 md:flex'
            )}
          >
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> move <Kbd>A</Kbd> approve <Kbd>R</Kbd> reject{' '}
            <Kbd>C</Kbd> comment
          </span>
        }
      />
      {degradedSources.length > 0 ? (
        <p
          role='status'
          className='border-b border-subtle px-3 py-2 text-xs text-secondary-token'
          data-testid='ovie-inbox-degraded'
        >
          {degradedSources.join(' and ')} cards did not load. Showing the rest.
        </p>
      ) : null}
      {body}
      <OvieInboxCommentDialog
        item={commentTarget?.item ?? null}
        preset={commentTarget?.preset ?? null}
        isSubmitting={submittingKey !== null}
        onOpenChange={open => {
          if (!open) setCommentTarget(null);
        }}
        onSubmit={(decision, comment) => {
          const target = commentTarget?.item;
          setCommentTarget(null);
          if (target) void decide(target, decision, comment);
        }}
      />
    </div>
  );
}
