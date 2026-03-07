'use client';

import { Button } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ClipboardCopy } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { AdminTableShell } from '@/components/admin/table/AdminTableShell';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { RightDrawer } from '@/components/organisms/RightDrawer';
import { UnifiedTable } from '@/components/organisms/table';
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

function formatFeedbackAsMarkdown(item: FeedbackRow): string {
  const userName = item.user.name ?? item.user.email ?? 'Unknown user';
  const date = new Date(item.createdAtIso).toLocaleString();
  const context = (item.context as { pathname?: string })?.pathname;

  let md = `## Feedback from @${userName} — ${date}\n\n`;
  md += `> ${item.message.replace(/\n/g, '\n> ')}\n\n`;
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
      {user.name ?? user.email ?? 'Unknown user'}
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
        ? 'bg-white/[0.04] cursor-pointer'
        : 'hover:bg-white/[0.02] cursor-pointer group',
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

      <div className='w-full lg:w-[58%] border-r border-subtle h-full'>
        <div className='flex items-center justify-between border-b border-subtle px-4 py-2'>
          <span className='text-xs text-secondary-token'>
            {rows.length} item{rows.length !== 1 ? 's' : ''}
          </span>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={copyAllAsMarkdown}
            disabled={rows.length === 0}
          >
            <ClipboardCopy className='mr-1.5 h-3.5 w-3.5' />
            Copy All as Markdown
          </Button>
        </div>
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

      <RightDrawer
        isOpen={Boolean(selected)}
        width={560}
        ariaLabel='Feedback details'
      >
        {selected ? (
          <div className='p-6 space-y-6 overflow-x-hidden'>
            <div>
              <h3 className='text-lg font-semibold text-primary-token'>
                Feedback details
              </h3>
              <p className='text-sm text-secondary-token'>
                Source: {selected.source} ·{' '}
                {new Date(selected.createdAtIso).toLocaleString()}
              </p>
            </div>

            <div className='space-y-2'>
              <p className='text-xs uppercase tracking-wide text-secondary-token'>
                User
              </p>
              <p className='text-sm text-primary-token'>
                {selected.user.name ?? 'Unknown user'}
              </p>
              <p className='text-sm text-secondary-token'>
                {selected.user.email ?? 'No email available'}
              </p>
              <p className='text-xs text-secondary-token'>
                Clerk ID: {selected.user.clerkId ?? 'N/A'}
              </p>
            </div>

            <div className='space-y-2'>
              <p className='text-xs uppercase tracking-wide text-secondary-token'>
                Feedback
              </p>
              <p className='text-sm leading-relaxed text-primary-token whitespace-pre-wrap'>
                {selected.message}
              </p>
            </div>

            <div className='space-y-2'>
              <p className='text-xs uppercase tracking-wide text-secondary-token'>
                Context
              </p>
              <pre className='text-xs bg-surface-2 border border-subtle rounded-lg p-3 overflow-auto text-secondary-token'>
                {JSON.stringify(selected.context, null, 2)}
              </pre>
            </div>

            <div className='flex items-center gap-3'>
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
              <span className='text-xs text-secondary-token'>
                {(() => {
                  if (selected.status !== 'dismissed')
                    return 'Marked as pending';
                  const date = selected.dismissedAtIso
                    ? new Date(selected.dismissedAtIso).toLocaleString()
                    : '';
                  return `Dismissed ${date}`;
                })()}
              </span>
            </div>
          </div>
        ) : null}
      </RightDrawer>
    </div>
  );
}
