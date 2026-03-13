'use client';

import { Button } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ClipboardCopy } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import {
  AdminTableHeader,
  AdminTableSubheader,
} from '@/components/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import {
  DrawerPropertyRow,
  DrawerSection,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbarActionButton,
  UnifiedTable,
} from '@/components/organisms/table';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';

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
    <span className='font-medium text-primary-token'>
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
function renderStatusCell({ getValue }: { getValue: () => any }) {
  return (
    <span className='rounded-full border border-subtle px-2.5 py-1 text-xs text-secondary-token'>
      {getValue() as FeedbackRow['status']}
    </span>
  );
}

export function AdminFeedbackTable({
  items,
}: Readonly<AdminFeedbackTableProps>) {
  const [selectedId, setSelectedId] = useState<string | null>(
    items[0]?.id ?? null
  );
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [rows, setRows] = useState(items);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const selected = useMemo(
    () => rows.find(item => item.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const dismissSelected = async () => {
    if (!selected || selected.status === 'dismissed') return;
    setDismissingId(selected.id);
    const response = await fetch(`/api/admin/feedback/${selected.id}/dismiss`, {
      method: 'POST',
    });
    if (response.ok) {
      setRows(current =>
        current.map(row =>
          row.id === selected.id
            ? {
                ...row,
                status: 'dismissed',
                dismissedAtIso: new Date().toISOString(),
              }
            : row
        )
      );
    }
    setDismissingId(null);
  };

  const showCopyToast = useCallback((message: string) => {
    setCopyToast(message);
    setTimeout(() => setCopyToast(null), 2000);
  }, []);

  const copySelectedAsMarkdown = useCallback(async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(formatFeedbackAsMarkdown(selected));
    showCopyToast('Copied to clipboard');
  }, [selected, showCopyToast]);

  const copyAllAsMarkdown = useCallback(async () => {
    const markdown = rows
      .map(item => formatFeedbackAsMarkdown(item))
      .join('\n---\n\n');
    await navigator.clipboard.writeText(markdown);
    showCopyToast(`Copied ${rows.length} items to clipboard`);
  }, [rows, showCopyToast]);

  // biome-ignore lint/suspicious/noExplicitAny: TanStack Table requires any for mixed-value-type column arrays
  const columns = useMemo<ColumnDef<FeedbackRow, any>[]>(
    () => [
      columnHelper.accessor('createdAtIso', {
        id: 'submitted',
        header: 'Submitted',
        cell: ({ getValue }) => new Date(getValue()).toLocaleString(),
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
        ? 'cursor-pointer bg-(--linear-row-selected)'
        : 'group cursor-pointer hover:bg-(--linear-row-hover)',
    [selectedId]
  );

  return (
    <div className='flex h-full min-h-[620px] overflow-hidden'>
      {/* Toast notification */}
      {copyToast && (
        <div className='fixed top-4 right-4 z-50 rounded-lg bg-surface-2 border border-subtle px-4 py-2.5 text-sm text-primary-token shadow-lg'>
          {copyToast}
        </div>
      )}

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
                <div className='px-4 py-10 text-center text-sm text-secondary-token'>
                  <p className='font-medium'>No feedback found</p>
                </div>
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
                <Button
                  type='button'
                  onClick={dismissSelected}
                  disabled={selected.status === 'dismissed'}
                  loading={dismissingId === selected.id}
                >
                  Dismiss
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  onClick={copySelectedAsMarkdown}
                >
                  <ClipboardCopy className='mr-1.5 h-3.5 w-3.5' />
                  Copy as Markdown
                </Button>
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
              <div className='rounded-[12px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-3 py-2.5 text-[13px] leading-[19px] whitespace-pre-wrap text-(--linear-text-primary)'>
                {selected.message}
              </div>
            </DrawerSection>

            <DrawerSection title='Context'>
              <pre className='overflow-auto rounded-[12px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) p-3 text-[11px] leading-[16px] text-(--linear-text-secondary)'>
                {JSON.stringify(selected.context, null, 2)}
              </pre>
            </DrawerSection>
          </>
        ) : null}
      </EntitySidebarShell>
    </div>
  );
}
