'use client';

import { Button } from '@jovie/ui';
import { useMemo, useState } from 'react';

import { RightDrawer } from '@/components/organisms/RightDrawer';

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

export function AdminFeedbackTable({
  items,
}: Readonly<AdminFeedbackTableProps>) {
  const [selectedId, setSelectedId] = useState<string | null>(
    items[0]?.id ?? null
  );
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [rows, setRows] = useState(items);

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

  return (
    <div className='flex min-h-[620px] border border-subtle rounded-xl overflow-hidden bg-surface-1'>
      <div className='w-full lg:w-[58%] border-r border-subtle'>
        <div className='px-5 py-4 border-b border-subtle'>
          <h2 className='text-base font-semibold text-primary-token'>
            Product feedback
          </h2>
          <p className='text-sm text-secondary-token'>
            Review what customers shared and keep the queue tidy.
          </p>
        </div>
        <div className='max-h-[560px] overflow-auto'>
          <table className='w-full text-sm'>
            <thead className='bg-surface-2 text-secondary-token'>
              <tr>
                <th className='px-4 py-3 text-left font-medium'>Submitted</th>
                <th className='px-4 py-3 text-left font-medium'>User</th>
                <th className='px-4 py-3 text-left font-medium'>Feedback</th>
                <th className='px-4 py-3 text-left font-medium'>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(item => {
                const isSelected = item.id === selectedId;
                return (
                  <tr
                    key={item.id}
                    className={
                      isSelected ? 'bg-brand-primary/5' : 'hover:bg-surface-2'
                    }
                  >
                    <td className='px-4 py-3 align-top'>
                      <button
                        type='button'
                        onClick={() => setSelectedId(item.id)}
                        className='text-left text-secondary-token hover:text-primary-token'
                      >
                        {new Date(item.createdAtIso).toLocaleString()}
                      </button>
                    </td>
                    <td className='px-4 py-3 align-top text-primary-token'>
                      {item.user.name ?? item.user.email ?? 'Unknown user'}
                    </td>
                    <td className='px-4 py-3 align-top text-primary-token max-w-[280px]'>
                      <p className='line-clamp-2'>{item.message}</p>
                    </td>
                    <td className='px-4 py-3 align-top'>
                      <span className='rounded-full border border-subtle px-2.5 py-1 text-xs text-secondary-token'>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
