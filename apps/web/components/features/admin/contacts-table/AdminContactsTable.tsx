'use client';

import { Badge, Button } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminPeopleRightPanel } from '@/components/features/admin/AdminPeopleRightPanelProvider';
import { toast } from '@/components/feedback';
import { AdminTableHeader } from '@/features/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import {
  CONTACT_LIFECYCLE_STAGES,
  type ContactLifecycleStage,
  getContactLifecycleStageLabel,
} from '@/lib/contacts/lifecycle';
import { cn } from '@/lib/utils';

/** Serialized canonical contact row (dates as ISO strings for the client). */
export interface AdminContactRow {
  dedupeKey: string;
  stage: ContactLifecycleStage;
  overrideStage: ContactLifecycleStage | null;
  displayName: string | null;
  email: string | null;
  handle: string | null;
  avatarUrl: string | null;
  sources: string[];
  certifiedAt: string | null;
  stageAt: string | null;
  activityAt: string | null;
  firstSeenAt: string | null;
  userId: string | null;
  creatorProfileId: string | null;
  leadId: string | null;
  waitlistEntryId: string | null;
}

export type AdminContactStageMetrics = Record<ContactLifecycleStage, number> & {
  total: number;
};

interface AdminContactsTableProps {
  readonly rows: AdminContactRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly stage: string | null;
  readonly search: string;
  readonly metrics: AdminContactStageMetrics;
}

interface TimelineItem {
  id: string;
  fromStage: ContactLifecycleStage | null;
  toStage: ContactLifecycleStage;
  actorType: string;
  source: string | null;
  reason: string | null;
  createdAt: string;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

const STAGE_BADGE_VARIANT: Record<
  ContactLifecycleStage,
  'secondary' | 'primary' | 'success' | 'warning' | 'error'
> = {
  suggested: 'secondary',
  approved: 'secondary',
  outreach: 'secondary',
  profile_created: 'secondary',
  certified: 'primary',
  signed_up: 'secondary',
  claimed: 'secondary',
  activated: 'success',
  paying: 'success',
  churned: 'warning',
};

function StageBadge({ stage }: { readonly stage: ContactLifecycleStage }) {
  return (
    <Badge size='sm' variant={STAGE_BADGE_VARIANT[stage]}>
      {getContactLifecycleStageLabel(stage)}
    </Badge>
  );
}

function ContactDetailPanel({
  contact,
  onClose,
}: {
  readonly contact: AdminContactRow | null;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!contact) {
      setTimeline([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/admin/contacts?key=${encodeURIComponent(contact.dedupeKey)}`, {
      headers: { Accept: 'application/json' },
    })
      .then(res => (res.ok ? res.json() : { timeline: [] }))
      .then(data => {
        if (!cancelled) setTimeline(data.timeline ?? []);
      })
      .catch(() => {
        if (!cancelled) setTimeline([]);
      });
    return () => {
      cancelled = true;
    };
  }, [contact]);

  const setStage = useCallback(
    async (toStage: ContactLifecycleStage) => {
      if (!contact) return;
      setPending(toStage);
      try {
        const res = await fetch('/api/admin/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            dedupeKey: contact.dedupeKey,
            toStage,
            identity: {
              displayName: contact.displayName,
              emailNormalized: contact.email,
              primaryHandle: contact.handle,
              avatarUrl: contact.avatarUrl,
              userId: contact.userId,
              creatorProfileId: contact.creatorProfileId,
              leadId: contact.leadId,
              waitlistEntryId: contact.waitlistEntryId,
            },
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            (data as { error?: string }).error ?? 'Failed to update stage'
          );
        }
        toast.success(`Moved to ${getContactLifecycleStageLabel(toStage)}`);
        router.refresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Failed to update stage'
        );
      } finally {
        setPending(null);
      }
    },
    [contact, router]
  );

  if (!contact) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-2 p-6 text-center'>
        <p className='text-sm font-medium text-primary-token'>
          No contact selected
        </p>
        <p className='text-xs text-secondary-token'>
          Select a row to inspect the canonical record.
        </p>
      </div>
    );
  }

  return (
    <div
      className='flex h-full flex-col gap-4 overflow-y-auto p-4'
      data-testid='admin-contact-detail-panel'
    >
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-semibold tracking-tight text-primary-token'>
            {contact.displayName ??
              contact.email ??
              contact.handle ??
              'Unknown'}
          </p>
          <p className='truncate text-xs text-secondary-token'>
            {contact.email ?? contact.handle ?? contact.dedupeKey}
          </p>
        </div>
        <Button variant='ghost' size='sm' onClick={onClose}>
          Close
        </Button>
      </div>

      <div className='flex items-center gap-2'>
        <StageBadge stage={contact.stage} />
        {contact.overrideStage && contact.overrideStage !== contact.stage ? (
          <span className='text-xs text-secondary-token'>
            override: {getContactLifecycleStageLabel(contact.overrideStage)}
          </span>
        ) : null}
      </div>

      <dl className='grid grid-cols-2 gap-x-3 gap-y-2 text-xs'>
        <dt className='text-secondary-token'>Sources</dt>
        <dd className='text-primary-token'>{contact.sources.join(', ')}</dd>
        <dt className='text-secondary-token'>First seen</dt>
        <dd className='text-primary-token'>
          {formatDate(contact.firstSeenAt)}
        </dd>
        <dt className='text-secondary-token'>Stage entered</dt>
        <dd className='text-primary-token'>{formatDate(contact.stageAt)}</dd>
        <dt className='text-secondary-token'>Last activity</dt>
        <dd className='text-primary-token'>{formatDate(contact.activityAt)}</dd>
        <dt className='text-secondary-token'>Identity key</dt>
        <dd className='truncate font-mono text-primary-token'>
          {contact.dedupeKey}
        </dd>
      </dl>

      <div className='flex flex-wrap gap-2'>
        <Button
          size='sm'
          variant='secondary'
          disabled={pending != null || contact.stage === 'approved'}
          onClick={() => setStage('approved')}
        >
          {pending === 'approved' ? 'Approving…' : 'Approve'}
        </Button>
        <Button
          size='sm'
          variant='secondary'
          disabled={pending != null || contact.stage === 'certified'}
          onClick={() => setStage('certified')}
        >
          {pending === 'certified' ? 'Certifying…' : 'Certify'}
        </Button>
        <Button
          size='sm'
          variant='secondary'
          disabled={pending != null || contact.stage === 'churned'}
          onClick={() => setStage('churned')}
        >
          {pending === 'churned' ? 'Updating…' : 'Mark churned'}
        </Button>
      </div>

      <div>
        <p className='mb-2 text-xs font-medium text-secondary-token'>
          Stage history
        </p>
        {timeline.length === 0 ? (
          <p className='text-xs text-secondary-token'>
            No recorded transitions yet.
          </p>
        ) : (
          <ol className='space-y-2'>
            {timeline.map(item => (
              <li key={item.id} className='text-xs'>
                <span className='text-primary-token'>
                  {item.fromStage
                    ? getContactLifecycleStageLabel(item.fromStage)
                    : '—'}{' '}
                  → {getContactLifecycleStageLabel(item.toStage)}
                </span>
                <span className='ml-2 text-secondary-token'>
                  {item.actorType} · {formatDate(item.createdAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export function AdminContactsTable({
  rows,
  total,
  page,
  pageSize,
  stage,
  search,
  metrics,
}: Readonly<AdminContactsTableProps>) {
  const [selected, setSelected] = useState<AdminContactRow | null>(null);

  const buildHref = useCallback(
    (params: Record<string, string | null>) => {
      const searchParams = new URLSearchParams({ view: 'contacts' });
      if (search) searchParams.set('q', search);
      if (stage) searchParams.set('stage', stage);
      if (page > 1) searchParams.set('page', String(page));
      for (const [key, value] of Object.entries(params)) {
        if (value == null || value === '') searchParams.delete(key);
        else searchParams.set(key, value);
      }
      const qs = searchParams.toString();
      return qs ? `?${qs}` : '?view=contacts';
    },
    [search, stage, page]
  );

  const detailPanel = useMemo(
    () => (
      <ContactDetailPanel
        contact={selected}
        onClose={() => setSelected(null)}
      />
    ),
    [selected]
  );
  useAdminPeopleRightPanel(detailPanel);

  const stageHref = useCallback(
    (value: string | null) => buildHref({ stage: value, page: null }),
    [buildHref]
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = rows.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + rows.length;

  return (
    <AdminTableShell
      testId='admin-contacts-content'
      className='rounded-none border-0'
      toolbar={
        <>
          <AdminTableHeader
            title='Customers'
            subtitle='One canonical record per person across waitlist, leads, profiles, and users.'
          />
          <div className='flex flex-wrap items-center gap-2 border-b border-(--app-shell-frame-seam) bg-surface-1 px-app-header py-2'>
            <a
              href={stageHref(null)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs',
                stage == null
                  ? 'bg-surface-3 font-medium text-primary-token'
                  : 'text-secondary-token hover:text-primary-token'
              )}
            >
              All ({metrics.total})
            </a>
            {CONTACT_LIFECYCLE_STAGES.map(value => (
              <a
                key={value}
                href={stageHref(value)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs',
                  stage === value
                    ? 'bg-surface-3 font-medium text-primary-token'
                    : 'text-secondary-token hover:text-primary-token'
                )}
                data-testid={`contacts-stage-filter-${value}`}
              >
                {getContactLifecycleStageLabel(value)} ({metrics[value]})
              </a>
            ))}
            <form
              method='GET'
              action=''
              className='ml-auto flex items-center gap-1'
            >
              <input type='hidden' name='view' value='contacts' />
              {stage ? (
                <input type='hidden' name='stage' value={stage} />
              ) : null}
              <input
                type='search'
                name='q'
                defaultValue={search}
                placeholder='Search name, email, handle'
                aria-label='Search Contacts'
                className='h-7 w-48 rounded-md border border-(--linear-border-strong) bg-surface-0 px-2 text-xs text-primary-token placeholder:text-tertiary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              />
            </form>
          </div>
        </>
      }
      footer={
        <div className='flex items-center justify-between px-app-header py-2 text-xs text-secondary-token'>
          <span>
            Showing {from.toLocaleString()}–{to.toLocaleString()} of{' '}
            {total.toLocaleString()}
          </span>
          <span className='flex gap-2'>
            {page > 1 ? (
              <a
                className='text-primary-token underline-offset-2 hover:underline'
                href={buildHref({ page: String(page - 1) })}
              >
                Previous
              </a>
            ) : null}
            {page < totalPages ? (
              <a
                className='text-primary-token underline-offset-2 hover:underline'
                href={buildHref({ page: String(page + 1) })}
              >
                Next
              </a>
            ) : null}
          </span>
        </div>
      }
    >
      {({ stickyTopPx }) => (
        <table
          className='w-full table-fixed text-sm'
          data-testid='admin-contacts-table'
        >
          <thead
            className='sticky z-10 bg-surface-1 text-left text-xs text-secondary-token'
            style={{ top: stickyTopPx }}
          >
            <tr>
              <th className='w-[28%] px-app-header py-2 font-medium'>Name</th>
              <th className='w-[24%] px-2 py-2 font-medium'>Email</th>
              <th className='w-[14%] px-2 py-2 font-medium'>Handle</th>
              <th className='w-[12%] px-2 py-2 font-medium'>Stage</th>
              <th className='w-[12%] px-2 py-2 font-medium'>Sources</th>
              <th className='w-[10%] px-2 py-2 pr-app-header font-medium'>
                Last activity
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className='px-app-header py-10 text-center text-sm text-secondary-token'
                >
                  {search
                    ? `No contacts matching “${search}”.`
                    : 'No contacts at this stage yet.'}
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr
                  key={row.dedupeKey}
                  onClick={() =>
                    setSelected(prev =>
                      prev?.dedupeKey === row.dedupeKey ? null : row
                    )
                  }
                  className={cn(
                    'h-14 cursor-pointer border-t border-(--app-shell-frame-seam)',
                    selected?.dedupeKey === row.dedupeKey
                      ? 'bg-surface-2'
                      : 'hover:bg-surface-1'
                  )}
                  data-testid='admin-contact-row'
                >
                  <td className='truncate px-app-header py-2 font-medium text-primary-token'>
                    {row.displayName ?? '—'}
                  </td>
                  <td className='truncate px-2 py-2 text-secondary-token'>
                    {row.email ?? '—'}
                  </td>
                  <td className='truncate px-2 py-2 text-secondary-token'>
                    {row.handle ? `@${row.handle}` : '—'}
                  </td>
                  <td className='px-2 py-2'>
                    <StageBadge stage={row.stage} />
                  </td>
                  <td className='truncate px-2 py-2 text-xs text-secondary-token'>
                    {row.sources.join(', ')}
                  </td>
                  <td className='px-2 py-2 pr-app-header text-xs text-secondary-token'>
                    {formatDate(row.activityAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </AdminTableShell>
  );
}
