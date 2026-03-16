'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ClipboardCopy, MessageSquareText } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AdminTableHeader,
  AdminTableSubheader,
} from '@/components/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import {
  DrawerButton,
  DrawerPropertyRow,
  DrawerSection,
  DrawerSurfaceCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbarActionButton,
  TableEmptyState,
  UnifiedTable,
} from '@/components/organisms/table';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { useDismissFeedbackMutation } from '@/lib/queries';

interface FeedbackRow {
  id: string;
  message: string;
  source: string;
  status: 'pending' | 'dismissed';
  createdAtIso: string;
  dismissedAtIso: string | null;
  user: {
    id: string | null;
    name: string | null;
    email: string | null;
    clerkId: string | null;
  };
  context: Record<string, unknown>;
}

interface AdminFeedbackTableProps {
  readonly items: FeedbackRow[];
}

function getFeedbackUserLabel(user: FeedbackRow['user']): string {
  return user.name ?? user.email ?? 'Unknown user';
}

function formatFeedbackAsMarkdown(item: FeedbackRow): string {
  const userName = getFeedbackUserLabel(item.user);
  const date = new Date(item.createdAtIso).toLocaleString();
  const context = (item.context as { pathname?: string })?.pathname;

  let md = `## Feedback from @${userName} — ${date}\n\n`;
  md += `> ${item.message.replaceAll('\n', '\n> ')}\n\n`;
  if (context) {
    md += `**Context:** ${context}\n`;
  }
  if (item.user.email) {
    md += `**User:** ${item.user.email}\n`;
  }
  md += `**Source:** ${item.source}\n`;
  return md;
}

const columnHelper = createColumnHelper<FeedbackRow>();

// biome-ignore lint/suspicious/noExplicitAny: TanStack Table cell renderers require any for getValue typing
function renderUserCell({ getValue }: { getValue: () => any }) {
  const user = getValue() as FeedbackRow['user'];
  return (
    <span className='text-[13px] font-[510] text-(--linear-text-primary)'>
      {getFeedbackUserLabel(user)}
    </span>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: TanStack Table cell renderers require any for getValue typing
function renderMessageCell({ getValue }: { getValue: () => any }) {
  return (
    <TruncatedText lines={2} className='text-(--linear-text-primary)'>
      {getValue() as string}
    </TruncatedText>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: TanStack Table cell renderers require any for getValue typing
function renderStatusCell({ getValue }: { getValue: () => any }) {
  const status = getValue() as FeedbackRow['status'];
  return (
    <span
      className={
        status === 'dismissed'
          ? 'inline-flex min-h-[22px] items-center rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-2 py-0.5 text-[11px] font-[510] tracking-[-0.01em] text-(--linear-text-tertiary)'
          : 'inline-flex min-h-[22px] items-center rounded-[8px] border border-(--linear-border-default) bg-(--linear-bg-surface-1) px-2 py-0.5 text-[11px] font-[510] tracking-[-0.01em] text-(--linear-text-secondary)'
      }
    >
      {status}
    </span>
  );
}

export function AdminFeedbackTable({
  items,
}: Readonly<AdminFeedbackTableProps>) {
  const [selectedId, setSelectedId] = useState<string | null>(
    items[0]?.id ?? null
  );
  const { mutateAsync: dismissFeedback, isPending: isDismissing } =
    useDismissFeedbackMutation();
  const [rows, setRows] = useState(items);

  const selected = useMemo(
    () => rows.find(item => item.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const dismissSelected = async () => {
    if (!selected || selected.status === 'dismissed') return;
    try {
      await dismissFeedback(selected.id);
      setRows(current =>
        current.map(row =>
          row.id === selected.id
            ? {
                ...row,
                status: 'dismissed' as const,
                dismissedAtIso: new Date().toISOString(),
              }
            : row
        )
      );
    } catch {
      // Error toast handled by mutation's onError callback
    }
  };

  const copySelectedAsMarkdown = useCallback(async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(formatFeedbackAsMarkdown(selected));
    toast.success('Copied to clipboard');
  }, [selected]);

  const copyAllAsMarkdown = useCallback(async () => {
    const markdown = rows
      .map(item => formatFeedbackAsMarkdown(item))
      .join('\n---\n\n');
    await navigator.clipboard.writeText(markdown);
    toast.success(`Copied ${rows.length} items to clipboard`);
  }, [rows]);

  // biome-ignore lint/suspicious/noExplicitAny: TanStack Table requires any for mixed-value-type column arrays
  const columns = useMemo<ColumnDef<FeedbackRow, any>[]>(
    () => [
      columnHelper.accessor('createdAtIso', {
        id: 'submitted',
        header: 'Submitted',
        cell: ({ getValue }) => (
          <span className='whitespace-nowrap'>
            {new Date(getValue()).toLocaleString()}
          </span>
        ),
        size: 180,
      }),
      columnHelper.accessor('user', {
        id: 'user',
        header: 'User',
        cell: renderUserCell,
        size: 200,
      }),
      columnHelper.accessor('message', {
        id: 'message',
        header: 'Feedback',
        cell: renderMessageCell,
        size: 400,
      }),
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: renderStatusCell,
        size: 120,
      }),
    ],
    []
  );

  const getRowClassName = useCallback(
    (row: FeedbackRow) =>
      row.id === selectedId
        ? 'cursor-pointer bg-(--linear-bg-surface-1) shadow-[inset_2px_0_0_0_var(--linear-border-focus),inset_0_0_0_1px_rgba(91,140,255,0.18)] hover:bg-(--linear-bg-surface-1)'
        : 'group cursor-pointer bg-transparent hover:bg-(--linear-bg-surface-1)',
    [selectedId]
  );

  return (
    <div className='flex h-full min-h-[620px] overflow-hidden'>
      <div className='h-full w-full border-r border-(--linear-border-subtle) bg-(--linear-app-content-surface) lg:w-[58%]'>
        <AdminTableHeader
          title='Feedback'
          subtitle='Triage product feedback and close the loop with clear status.'
        />
        <AdminTableSubheader
          start={
            <span className={PAGE_TOOLBAR_META_TEXT_CLASS}>
              {rows.length} item{rows.length === 1 ? '' : 's'}
            </span>
          }
          end={
            <PageToolbarActionButton
              label='Copy all as Markdown'
              ariaLabel='Copy all feedback as Markdown'
              tooltipLabel='Copy all as Markdown'
              iconOnly
              disabled={rows.length === 0}
              onClick={copyAllAsMarkdown}
              icon={<ClipboardCopy className='h-3.5 w-3.5' />}
            />
          }
        />
        <AdminTableShell testId='admin-feedback-table'>
          {() => (
            <UnifiedTable
              data={rows}
              columns={columns}
              getRowId={row => row.id}
              getRowClassName={getRowClassName}
              onRowClick={row => setSelectedId(row.id)}
              enableVirtualization={true}
              minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
              className='text-[13px]'
              emptyState={
                <TableEmptyState
                  icon={
                    <MessageSquareText className='h-5 w-5' aria-hidden='true' />
                  }
                  title='No feedback found'
                  description='New feedback will appear here once users submit it.'
                  className='min-h-[220px] rounded-none border-x-0 border-b-0 shadow-none'
                />
              }
            />
          )}
        </AdminTableShell>
      </div>

      <EntitySidebarShell
        isOpen={Boolean(selected)}
        width={560}
        ariaLabel='Feedback details'
        title='Feedback details'
        onClose={() => setSelectedId(null)}
        isEmpty={!selected}
        emptyMessage='Select a feedback row to view details.'
        entityHeader={
          selected ? (
            <div className='space-y-2'>
              <p className='text-[12px] leading-[16px] text-(--linear-text-secondary)'>
                Source: {selected.source} ·{' '}
                {new Date(selected.createdAtIso).toLocaleString()}
              </p>
              <div className='space-y-0.5'>
                <p className='truncate text-[15px] font-[590] leading-[18px] tracking-[-0.015em] text-(--linear-text-primary)'>
                  {getFeedbackUserLabel(selected.user)}
                </p>
                <p className='truncate text-[12px] leading-[16px] text-(--linear-text-secondary)'>
                  {selected.user.email ?? 'No email available'}
                </p>
              </div>
            </div>
          ) : undefined
        }
        footer={
          selected ? (
            <div className='space-y-3'>
              <div className='flex items-center gap-2'>
                <DrawerButton
                  type='button'
                  tone='secondary'
                  onClick={dismissSelected}
                  disabled={selected.status === 'dismissed'}
                  loading={isDismissing}
                >
                  Dismiss
                </DrawerButton>
                <DrawerButton
                  type='button'
                  tone='secondary'
                  onClick={copySelectedAsMarkdown}
                >
                  <ClipboardCopy className='mr-1.5 h-3.5 w-3.5' />
                  Copy as Markdown
                </DrawerButton>
              </div>
              <span className='text-[12px] leading-[16px] text-(--linear-text-tertiary)'>
                {(() => {
                  if (selected.status !== 'dismissed') {
                    return 'Marked as pending';
                  }
                  const date = selected.dismissedAtIso
                    ? new Date(selected.dismissedAtIso).toLocaleString()
                    : '';
                  return `Dismissed ${date}`;
                })()}
              </span>
            </div>
          ) : undefined
        }
      >
        {selected ? (
          <>
            <DrawerSection title='User'>
              <div className='space-y-1'>
                <DrawerPropertyRow
                  label='User'
                  labelWidth={84}
                  value={getFeedbackUserLabel(selected.user)}
                />
                <DrawerPropertyRow
                  label='Email'
                  labelWidth={84}
                  value={selected.user.email ?? 'No email available'}
                />
                <DrawerPropertyRow
                  label='Clerk ID'
                  labelWidth={84}
                  value={selected.user.clerkId ?? 'N/A'}
                />
              </div>
            </DrawerSection>

            <DrawerSection title='Feedback'>
              <DrawerSurfaceCard className='rounded-[12px] bg-(--linear-bg-surface-0) px-3 py-2.5 text-[13px] leading-[19px] whitespace-pre-wrap text-(--linear-text-primary)'>
                {selected.message}
              </DrawerSurfaceCard>
            </DrawerSection>

            <DrawerSection title='Context'>
              <DrawerSurfaceCard className='overflow-auto rounded-[12px] bg-(--linear-bg-surface-0) p-0'>
                <pre className='p-3 text-[11px] leading-[16px] text-(--linear-text-secondary)'>
                  {JSON.stringify(selected.context, null, 2)}
                </pre>
              </DrawerSurfaceCard>
            </DrawerSection>
          </>
        ) : null}
      </EntitySidebarShell>
    </div>
  );
}
