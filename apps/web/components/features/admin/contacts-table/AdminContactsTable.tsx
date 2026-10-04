'use client';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminPeopleRightPanel } from '@/components/features/admin/AdminPeopleRightPanelProvider';
import { toast } from '@/components/feedback';
import {
  DrawerSection,
  EntityHeader,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { PersonCell } from '@/components/organisms/table/atoms/PersonCell';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableSubheader } from '@/features/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { useAdminTableKeyboardNavigation } from '@/features/admin/table/useAdminTableKeyboardNavigation';
import type {
  ContactCertificationInspection,
  ContactEvidenceDecision,
  ContactEvidenceItem,
} from '@/lib/contacts/certification';
import {
  CONTACT_LIFECYCLE_STAGES,
  type ContactLifecycleStage,
  getContactLifecycleStageLabel,
} from '@/lib/contacts/lifecycle';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';

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
  createdAt: string;
}

interface ContactDetailResponse {
  readonly timeline: TimelineItem[];
  readonly certification: ContactCertificationInspection;
}

function humanize(value: string) {
  if (value === 'dsp') return 'DSP artist identities';
  if (value === 'catalog') return 'Releases, recordings & ISRCs';
  if (value === 'stale') return 'Recertification required';
  const label = value.replaceAll('_', ' ');
  return label[0]?.toUpperCase() + label.slice(1);
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

const adminContactColumn = createColumnHelper<AdminContactRow>();

const ADMIN_CONTACT_COLUMNS = [
  adminContactColumn.display({
    id: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <PersonCell
        name={row.original.displayName ?? row.original.email ?? '—'}
        avatarUrl={row.original.avatarUrl}
      />
    ),
    size: 260,
  }),
  adminContactColumn.accessor('email', {
    header: 'Email',
    cell: ({ getValue }) => getValue() ?? '—',
    size: 240,
  }),
  adminContactColumn.accessor('handle', {
    header: 'Handle',
    cell: ({ getValue }) => {
      const handle = getValue();
      return handle ? `@${handle}` : '—';
    },
    size: 140,
  }),
  adminContactColumn.accessor('stage', {
    header: 'Stage',
    cell: ({ getValue }) => <StageBadge stage={getValue()} />,
    size: 120,
  }),
  adminContactColumn.accessor('sources', {
    header: 'Sources',
    cell: ({ getValue }) => getValue().join(', '),
    size: 160,
  }),
  adminContactColumn.accessor('activityAt', {
    header: 'Last Activity',
    cell: ({ getValue }) => formatDate(getValue()),
    size: 120,
  }),
] as ColumnDef<AdminContactRow, unknown>[];

function EvidenceItemCard({
  item,
  pending,
  onDecision,
}: Readonly<{
  item: ContactEvidenceItem;
  pending: boolean;
  onDecision: (
    item: ContactEvidenceItem,
    decision: ContactEvidenceDecision,
    correction?: string
  ) => Promise<void>;
}>) {
  const [correction, setCorrection] = useState('');
  const confidenceLabel =
    item.confidence === null
      ? 'unknown'
      : `${Math.round(item.confidence * 100)}%`;
  return (
    <article className='space-y-2 border-t border-subtle px-1 py-3 first:border-t-0'>
      <p className='text-xs font-medium text-primary-token'>{item.label}</p>
      {item.url ? (
        <a
          className='block truncate text-xs text-link'
          href={item.url}
          target='_blank'
          rel='noreferrer'
        >
          {item.value}
        </a>
      ) : (
        <p className='break-words text-xs text-secondary-token'>{item.value}</p>
      )}
      <p className='text-2xs text-tertiary-token'>
        {item.source} · {formatDate(item.observedAt)} · {confidenceLabel}{' '}
        confidence · {item.freshness}
      </p>
      <p className='text-2xs text-secondary-token'>{item.rationale}</p>
      <fieldset
        className='grid grid-cols-3 gap-1.5'
        aria-label={`Review ${item.label}`}
      >
        {(['yes', 'no', 'unsure'] as const).map(decision => (
          <Button
            key={decision}
            size='sm'
            variant={item.decision === decision ? 'primary' : 'secondary'}
            disabled={pending}
            aria-pressed={item.decision === decision}
            onClick={() => void onDecision(item, decision)}
          >
            {decision === 'yes' ? 'Yes' : decision === 'no' ? 'No' : 'Unsure'}
          </Button>
        ))}
      </fieldset>
      {['canonical:display-name', 'canonical:handle'].includes(item.key) ? (
        <form
          className='flex gap-1.5'
          onSubmit={event => {
            event.preventDefault();
            if (correction.trim()) void onDecision(item, 'no', correction);
          }}
        >
          <input
            aria-label={`Correct ${item.label}`}
            value={correction}
            onChange={event => setCorrection(event.target.value)}
            placeholder='Correct value'
            className='h-7 min-w-0 flex-1 rounded-md border border-strong bg-surface-0 px-2 text-xs text-primary-token'
          />
          <Button
            size='sm'
            variant='secondary'
            disabled={pending || !correction.trim()}
            type='submit'
          >
            Save
          </Button>
        </form>
      ) : null}
    </article>
  );
}

function ContactDetailPanel({
  contact,
  onClose,
}: Readonly<{
  contact: AdminContactRow | null;
  onClose: () => void;
}>) {
  const router = useRouter();
  const [detail, setDetail] = useState<ContactDetailResponse | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    if (!contact) return;
    fetch(`/api/admin/contacts?key=${encodeURIComponent(contact.dedupeKey)}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) throw new Error('load_failed');
        return response.json() as Promise<ContactDetailResponse>;
      })
      .then(setDetail)
      .catch(error => {
        if ((error as Error).name !== 'AbortError')
          toast.error('Evidence could not be loaded');
      });
    return () => controller.abort();
  }, [contact]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      if (!contact) return;
      const response = await fetch('/api/admin/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ dedupeKey: contact.dedupeKey, ...body }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        certification?: ContactCertificationInspection;
      };
      if (!response.ok) throw new Error(data.error ?? 'Update failed');
      if (data.certification) {
        setDetail(current =>
          current ? { ...current, certification: data.certification! } : current
        );
      }
    },
    [contact]
  );

  const review = useCallback(
    async (
      item: ContactEvidenceItem,
      decision: ContactEvidenceDecision,
      correction?: string
    ) => {
      setPending(item.key);
      try {
        await post({
          action: 'review_evidence',
          evidenceKey: item.key,
          evidenceRevision: item.revision,
          decision,
          correction,
        });
        toast.success(correction ? 'Correction saved' : 'Evidence updated');
        if (correction) router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Update failed');
      } finally {
        setPending(null);
      }
    },
    [post, router]
  );

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

  const certification = detail?.certification;
  const grouped = useMemo(() => {
    const groups = new Map<
      ContactEvidenceItem['category'],
      ContactEvidenceItem[]
    >();
    for (const current of certification?.items ?? []) {
      const list = groups.get(current.category) ?? [];
      list.push(current);
      groups.set(current.category, list);
    }
    return groups;
  }, [certification]);

  return (
    <EntitySidebarShell
      isOpen={Boolean(contact)}
      width={440}
      ariaLabel='Customer identity certification'
      data-testid='admin-contact-detail-panel'
      scrollStrategy='shell'
      onClose={onClose}
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      isEmpty={!contact}
      emptyMessage='Select a customer to inspect discovered evidence.'
      entityHeader={
        contact ? (
          <EntityHeader
            title={
              contact.displayName ??
              contact.email ??
              contact.handle ??
              'Unknown'
            }
            subtitle={contact.email ?? contact.handle ?? contact.dedupeKey}
            meta={
              <div className='flex items-center gap-2'>
                <StageBadge stage={contact.stage} />
                {certification ? (
                  <span className='text-xs text-secondary-token'>
                    {humanize(certification.status)}
                  </span>
                ) : null}
              </div>
            }
          />
        ) : undefined
      }
      footer={
        contact && certification ? (
          <Button
            className='w-full'
            disabled={!certification.canCertify || pending !== null}
            onClick={() => {
              setPending('certify');
              void post({
                action: 'certify_profile',
                evidenceRevision: certification.evidenceRevision,
              })
                .then(() => {
                  toast.success('Current evidence revision certified');
                  router.refresh();
                })
                .catch(error =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : 'Certification failed'
                  )
                )
                .finally(() => setPending(null));
            }}
          >
            {pending === 'certify' ? 'Certifying…' : 'Certify current profile'}
          </Button>
        ) : undefined
      }
    >
      {contact && !detail ? (
        <p className='min-h-24 p-4 text-xs text-secondary-token'>
          Loading discovered evidence…
        </p>
      ) : null}
      {contact && certification ? (
        <>
          <DrawerSection title='Coverage' collapsible={false}>
            <div className='grid grid-cols-4 gap-1 px-1 text-center text-xs'>
              {(['confirmed', 'rejected', 'unresolved', 'stale'] as const).map(
                key => (
                  <div key={key} className='rounded-md bg-surface-0 px-1 py-2'>
                    <p className='font-medium text-primary-token'>
                      {certification.coverage[key]}
                    </p>
                    <p className='text-2xs text-tertiary-token'>{key}</p>
                  </div>
                )
              )}
            </div>
            <p className='px-1 pt-2 text-2xs text-tertiary-token'>
              Checked:{' '}
              {certification.coverage.sourceClassesChecked.join(', ') || 'none'}
            </p>
            <p className='px-1 text-2xs text-tertiary-token'>
              Stale is a freshness warning and may overlap review decisions.
            </p>
          </DrawerSection>
          {[...grouped].map(([category, items]) => (
            <DrawerSection
              key={category}
              title={humanize(category)}
              defaultOpen={category !== 'facts'}
            >
              {items.map(current => (
                <EvidenceItemCard
                  key={current.key}
                  item={current}
                  pending={pending === current.key}
                  onDecision={review}
                />
              ))}
            </DrawerSection>
          ))}
          <DrawerSection title='Lifecycle'>
            <div className='flex gap-2 px-1 pb-2'>
              <Button
                size='sm'
                variant='secondary'
                disabled={pending !== null || contact.stage === 'approved'}
                onClick={() => void setStage('approved')}
              >
                Approve
              </Button>
              <Button
                size='sm'
                variant='secondary'
                disabled={pending !== null || contact.stage === 'churned'}
                onClick={() => void setStage('churned')}
              >
                Mark Churned
              </Button>
            </div>
            <ol className='space-y-2 px-1'>
              {(detail?.timeline ?? []).map(entry => (
                <li key={entry.id} className='text-xs text-secondary-token'>
                  {entry.fromStage
                    ? getContactLifecycleStageLabel(entry.fromStage)
                    : '—'}{' '}
                  → {getContactLifecycleStageLabel(entry.toStage)} ·{' '}
                  {entry.actorType} · {formatDate(entry.createdAt)}
                </li>
              ))}
            </ol>
          </DrawerSection>
        </>
      ) : null}
    </EntitySidebarShell>
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
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => rows.find(row => row.dedupeKey === selectedId) ?? null,
    [rows, selectedId]
  );
  const { handleKeyDown } = useAdminTableKeyboardNavigation({
    items: rows,
    selectedId,
    onSelect: setSelectedId,
    onToggleSidebar: () =>
      setSelectedId(current => (current ? null : (rows[0]?.dedupeKey ?? null))),
    onCloseSidebar: () => setSelectedId(null),
    isSidebarOpen: selected !== null,
    getId: row => row.dedupeKey,
  });

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
        onClose={() => setSelectedId(null)}
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
  const to = rows.length === 0 ? 0 : (page - 1) * pageSize + rows.length;

  return (
    <AdminTableShell
      testId='admin-contacts-content'
      className='rounded-none border-0'
      scrollContainerProps={{ tabIndex: 0, onKeyDown: handleKeyDown }}
      toolbar={
        <AdminTableSubheader
          start={
            <div className='w-56 shrink-0'>
              <Select
                value={stage ?? 'all'}
                onValueChange={value =>
                  router.push(stageHref(value === 'all' ? null : value))
                }
              >
                <SelectTrigger aria-label='Filter By Lifecycle Stage'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>
                    All stages ({metrics.total})
                  </SelectItem>
                  {CONTACT_LIFECYCLE_STAGES.map(value => (
                    <SelectItem key={value} value={value}>
                      {getContactLifecycleStageLabel(value)} ({metrics[value]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          end={
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
                className='h-7 w-48 rounded-md border border-strong bg-surface-0 px-2 text-xs text-primary-token placeholder:text-tertiary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              />
            </form>
          }
        />
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
      {() => (
        <AdminDataTable
          data={rows}
          columns={ADMIN_CONTACT_COLUMNS}
          rowMode='dense'
          getRowId={row => row.dedupeKey}
          getRowTestId={() => 'admin-contact-row'}
          isRowSelected={row => selectedId === row.dedupeKey}
          onRowClick={row =>
            setSelectedId(previous =>
              previous === row.dedupeKey ? null : row.dedupeKey
            )
          }
          // Page-level useAdminTableKeyboardNavigation owns j/k here.
          enableKeyboardNavigation={false}
          emptyState={
            <div className='px-app-header py-10 text-center text-sm text-secondary-token'>
              {search
                ? `No contacts matching “${search}”.`
                : 'No contacts at this stage yet.'}
            </div>
          }
        />
      )}
    </AdminTableShell>
  );
}
