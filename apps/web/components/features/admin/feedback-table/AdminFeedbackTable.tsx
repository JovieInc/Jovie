'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ClipboardCopy, MessageSquareText, XCircle } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import {
  DrawerCardActionBar,
  DrawerPropertyRow,
  DrawerSection,
  DrawerSurfaceCard,
  EntityHeaderCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { type DrawerHeaderAction } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import {
  type ContextMenuItemType,
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbarActionButton,
  TableEmptyState,
  UnifiedTable,
} from '@/components/organisms/table';
import { convertContextMenuItems } from '@/components/organisms/table/molecules/TableContextMenu';
import {
  AdminTableHeader,
  AdminTableSubheader,
} from '@/features/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
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
    <span className='text-app font-medium text-primary-token'>
      {getFeedbackUserLabel(user)}
    </span>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: TanStack Table cell renderers require any for getValue typing
function renderMessageCell({ getValue }: { getValue: () => any }) {
  return (
    <TruncatedText lines={2} className='text-primary-token'>
      {getValue() as string}
    </TruncatedText>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: TanStack Table cell renderers require any for getValue typing
function renderSubmittedCell({ getValue }: { getValue: () => any }) {
  return (
    <span className='whitespace-nowrap'>
      {new Date(getValue()).toLocaleString()}
    </span>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: TanStack Table cell renderers require any for getValue typing
function renderStatusCell({ getValue }: { getValue: () => any }) {
  const status = getValue() as FeedbackRow['status'];
  return (
    <span
      className={
        status === 'dismissed'
          ? 'inline-flex min-h-[22px] items-center rounded bg-surface-0 px-1.5 py-0.5 text-2xs font-medium tracking-[-0.01em] text-tertiary-token'
          : 'inline-flex min-h-[22px] items-center rounded bg-surface-1 px-1.5 py-0.5 text-2xs font-medium tracking-[-0.01em] text-secondary-token'
      }
    >
      {status}
    </span>
  );
}

function FeedbackActionsCell({
  row,
  getContextMenuItems,
}: {
  readonly row: FeedbackRow;
  readonly getContextMenuItems: (item: FeedbackRow) => ContextMenuItemType[];
}) {
  const items = convertContextMenuItems(getContextMenuItems(row));
  return (
    <div className='flex items-center justify-end'>
      <TableActionMenu items={items} align='end' />
    </div>
  );
}

/** Build column definitions for feedback table (file-level to satisfy S6478). */
function buildFeedbackColumns(deps: {
  getContextMenuItems: (item: FeedbackRow) => ContextMenuItemType[];
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Table requires any for mixed-value-type column arrays
}): ColumnDef<FeedbackRow, any>[] {
  return [
    columnHelper.accessor('createdAtIso', {
      id: 'submitted',
      header: 'Submitted',
      cell: renderSubmittedCell,
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
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <FeedbackActionsCell
          row={row.original}
          getContextMenuItems={deps.getContextMenuItems}
        />
      ),
      size: 48,
    }),
  ];
}

function formatDismissedLabel(dismissedAtIso: string | null): string {
  if (!dismissedAtIso) return 'Dismissed';
  return `Dismissed ${new Date(dismissedAtIso).toLocaleString()}`;
}

export function AdminFeedbackTable({
  items,
}: Readonly<AdminFeedbackTableProps>) {
  const [selectedId, setSelectedId] = useState<string | null>(
    items[0]?.id ?? null
  );
  const { mutateAsync: dismissFeedback } = useDismissFeedbackMutation();
  const [rows, setRows] = useState(items);
  const [dismissingIds, setDismissingIds] = useState<Record<string, true>>({});
  const dismissingIdsRef = useRef<Set<string>>(new Set());

  const selected = useMemo(
    () => rows.find(item => item.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const isDismissPending = useCallback(
    (id: string) => Boolean(dismissingIds[id]),
    [dismissingIds]
  );

  const dismissRow = useCallback(
    async (item: FeedbackRow) => {
      if (item.status === 'dismissed') return;
      if (dismissingIdsRef.current.has(item.id)) return;

      dismissingIdsRef.current.add(item.id);
      setDismissingIds(current => ({ ...current, [item.id]: true }));

      try {
        await dismissFeedback(item.id);
        setRows(current =>
          current.map(row =>
            row.id === item.id
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
      } finally {
        dismissingIdsRef.current.delete(item.id);
        setDismissingIds(current => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
      }
    },
    [dismissFeedback]
  );

  const copyRowAsMarkdown = useCallback(async (item: FeedbackRow) => {
    await navigator.clipboard.writeText(formatFeedbackAsMarkdown(item));
    toast.success('Copied to clipboard');
  }, []);

  const getContextMenuItems = useCallback(
    (item: FeedbackRow): ContextMenuItemType[] => [
      {
        id: 'copy-markdown',
        label: 'Copy as Markdown',
        icon: <ClipboardCopy className='h-4 w-4' />,
        onClick: () => copyRowAsMarkdown(item),
      },
      { type: 'separator' },
      {
        id: 'dismiss',
        label: 'Dismiss',
        icon: <XCircle className='h-4 w-4' />,
        onClick: () => dismissRow(item),
        disabled: item.status === 'dismissed' || isDismissPending(item.id),
      },
    ],
    [copyRowAsMarkdown, dismissRow, isDismissPending]
  );

  const copyAllAsMarkdown = useCallback(async () => {
    const markdown = rows
      .map(item => formatFeedbackAsMarkdown(item))
      .join('\n---\n\n');
    await navigator.clipboard.writeText(markdown);
    toast.success(`Copied ${rows.length} items to clipboard`);
  }, [rows]);

  // biome-ignore lint/suspicious/noExplicitAny: TanStack Table requires any for mixed-value-type column arrays
  const columns = useMemo<ColumnDef<FeedbackRow, any>[]>(
    () => buildFeedbackColumns({ getContextMenuItems }),
    [getContextMenuItems]
  );

  // Arrow keys update the detail pane (always visible in split view)
  const handleFocusedRowChange = useCallback(
    (index: number) => {
      if (rows[index]) {
        setSelectedId(rows[index].id);
      }
    },
    [rows]
  );

  const getRowClassName = useCallback(
    (row: FeedbackRow) =>
      row.id === selectedId
        ? 'group cursor-pointer bg-(--linear-row-selected) hover:bg-(--linear-row-selected)'
        : 'group cursor-pointer bg-transparent hover:bg-(--linear-row-hover)',
    [selectedId]
  );

  return (
    <div className='flex h-full min-h-[620px] overflow-hidden'>
      <div className='h-full w-full border-r border-subtle bg-(--linear-app-content-surface) lg:w-[58%]'>
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
              onFocusedRowChange={handleFocusedRowChange}
              getContextMenuItems={getContextMenuItems}
              enableVirtualization={true}
              minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
              className='text-[12.5px] [&_thead_th]:py-1 [&_thead_th]:text-[10px] [&_thead_th]:tracking-[0.07em]'
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
        scrollStrategy='shell'
        onClose={() => setSelectedId(null)}
        headerMode='minimal'
        hideMinimalHeaderBar
        isEmpty={!selected}
        emptyMessage='Select a feedback row to view details.'
        entityHeader={
          selected ? (
            <DrawerSurfaceCard variant='card' className='overflow-hidden p-3.5'>
              <EntityHeaderCard
                eyebrow='Feedback'
                title={getFeedbackUserLabel(selected.user)}
                subtitle={selected.user.email ?? 'No email available'}
                meta={
                  <div className='space-y-1 text-xs leading-[16px] text-secondary-token'>
                    <p>
                      Source: {selected.source} ·{' '}
                      {new Date(selected.createdAtIso).toLocaleString()}
                    </p>
                    <p className='text-tertiary-token'>
                      {selected.status === 'dismissed'
                        ? formatDismissedLabel(selected.dismissedAtIso)
                        : 'Marked as pending'}
                    </p>
                  </div>
                }
                actions={
                  <DrawerCardActionBar
                    primaryActions={
                      [
                        ...(selected.status === 'dismissed'
                          ? []
                          : [
                              {
                                id: 'dismiss-feedback',
                                label: 'Dismiss',
                                icon: XCircle,
                                disabled: isDismissPending(selected.id),
                                onClick: () => {
                                  dismissRow(selected);
                                },
                              } satisfies DrawerHeaderAction,
                            ]),
                        {
                          id: 'copy-feedback-markdown',
                          label: 'Copy as Markdown',
                          icon: ClipboardCopy,
                          onClick: () => {
                            copyRowAsMarkdown(selected);
                          },
                        } satisfies DrawerHeaderAction,
                      ] satisfies readonly DrawerHeaderAction[]
                    }
                    onClose={() => setSelectedId(null)}
                    overflowTriggerPlacement='card-top-right'
                    overflowTriggerIcon='vertical'
                    className='border-0 bg-transparent px-0 py-0'
                  />
                }
                bodyClassName='pr-9'
              />
            </DrawerSurfaceCard>
          ) : undefined
        }
      >
        {selected ? (
          <>
            <DrawerSection title='User' className='space-y-1.5' surface='card'>
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

            <DrawerSection
              title='Feedback'
              collapsible={false}
              className='space-y-1.5'
              surface='card'
            >
              <div className='rounded-md bg-surface-0 px-2.5 py-2 text-[12.5px] leading-[19px] whitespace-pre-wrap text-primary-token'>
                {selected.message}
              </div>
            </DrawerSection>

            <DrawerSection
              title='Context'
              collapsible={false}
              className='space-y-1.5'
              surface='card'
            >
              <div className='overflow-auto rounded-md bg-surface-0 p-0'>
                <pre className='p-2.5 text-[10.5px] leading-[16px] text-secondary-token'>
                  {JSON.stringify(selected.context, null, 2)}
                </pre>
              </div>
            </DrawerSection>
          </>
        ) : null}
      </EntitySidebarShell>
    </div>
  );
}
