'use client';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EvidenceItemCard,
  humanize,
} from '@/components/features/admin/contacts-table/AdminContactsTable';
import {
  DrawerSection,
  EntityHeader,
  EntityHeaderThumbnail,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import type {
  ContactCertificationInspection,
  ContactEvidenceDecision,
  ContactEvidenceItem,
} from '@/lib/contacts/certification';
import {
  OUTBOUND_REJECT_REASON_LABELS,
  OUTBOUND_REJECT_REASONS,
  OUTBOUND_VIEW_LABELS,
  type OutboundCopy,
  type OutboundRejectReason,
  type OutboundRow,
} from '@/lib/outbound/types';
import {
  OUTBOUND_RAIL_COMMAND_EVENT,
  type OutboundRailCommand,
} from './outbound-keys';

function useRailCommand(
  command: OutboundRailCommand,
  enabled: boolean,
  run: () => void
) {
  useEffect(() => {
    if (!enabled) return;
    const listener = (event: Event) => {
      if ((event as CustomEvent<OutboundRailCommand>).detail === command) run();
    };
    window.addEventListener(OUTBOUND_RAIL_COMMAND_EVENT, listener);
    return () =>
      window.removeEventListener(OUTBOUND_RAIL_COMMAND_EVENT, listener);
  }, [command, enabled, run]);
}

export const OUTBOUND_RAIL_WIDTH = 440;

export interface OutboundRailProps {
  readonly row: OutboundRow | null;
  readonly certification: ContactCertificationInspection | null;
  readonly certificationLoading: boolean;
  readonly activeFactKey: string | null;
  readonly pending: string | null;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onFact: (
    item: ContactEvidenceItem,
    decision: ContactEvidenceDecision,
    correction?: string
  ) => Promise<void>;
  readonly onCertify: () => void;
  readonly onApprove: (copy: OutboundCopy) => void;
  readonly onSaveCopy: (copy: OutboundCopy) => void;
  readonly onHold: () => void;
  readonly onReject: (reason: OutboundRejectReason) => void;
}

function approvalLine(row: OutboundRow): string {
  if (row.approval.target === 'rejected')
    return `Rejected · ${
      row.approval.rejectReason
        ? OUTBOUND_REJECT_REASON_LABELS[row.approval.rejectReason]
        : 'no reason'
    }`;
  if (row.approval.target === 'held') return 'Held';
  if (row.approval.target === 'stale')
    return 'Person changed since approval. Approve again.';
  if (row.approval.copy === 'stale')
    return 'Message changed since approval. Approve again.';
  if (row.approval.copy === 'approved' && row.approval.target === 'approved')
    return 'Approved for send';
  if (row.approval.copy === 'draft' && row.message?.revision)
    return 'Edited draft, not approved';
  return 'Not approved';
}

function MessageSection({
  row,
  pending,
  canApprove,
  onApprove,
  onSaveCopy,
}: Readonly<{
  row: OutboundRow;
  pending: string | null;
  canApprove: boolean;
  onApprove: (copy: OutboundCopy) => void;
  onSaveCopy: (copy: OutboundCopy) => void;
}>) {
  const message = row.message;
  const [subject, setSubject] = useState(message?.subject ?? '');
  const [body, setBody] = useState(message?.body ?? '');
  useEffect(() => {
    setSubject(message?.subject ?? '');
    setBody(message?.body ?? '');
  }, [message?.subject, message?.body]);

  const copy = useMemo<OutboundCopy | null>(
    () =>
      message
        ? {
            channel: message.channel,
            subject: message.channel === 'email' ? subject : null,
            body,
          }
        : null,
    [body, message, subject]
  );
  const approveEnabled =
    copy !== null && canApprove && pending === null && body.trim().length > 0;
  const approve = useCallback(() => {
    if (copy) onApprove(copy);
  }, [copy, onApprove]);
  useRailCommand('approve', approveEnabled, approve);

  if (!message || !copy) {
    return (
      <DrawerSection title='Message' collapsible={false}>
        <p className='px-1 pb-2 text-xs text-secondary-token'>
          {row.channel
            ? 'No claim link yet. Build the profile to draft a message.'
            : 'No email or Instagram on file, so there is no way to reach them.'}
        </p>
      </DrawerSection>
    );
  }
  const edited =
    body !== message.body ||
    (message.channel === 'email' && subject !== (message.subject ?? ''));
  return (
    <DrawerSection title='Message' collapsible={false}>
      <div className='space-y-2 px-1 pb-2'>
        <p className='text-2xs text-tertiary-token'>
          {message.channel === 'email' ? 'Email' : 'Instagram DM'} ·{' '}
          <span data-testid='outbound-approval-line'>{approvalLine(row)}</span>
        </p>
        {message.channel === 'email' ? (
          <input
            aria-label='Subject'
            value={subject}
            onChange={event => setSubject(event.target.value)}
            className='h-7 w-full rounded-md border border-strong bg-surface-0 px-2 text-xs text-primary-token'
          />
        ) : null}
        <Textarea
          aria-label='Message Body'
          value={body}
          onChange={event => setBody(event.target.value)}
          rows={6}
          resizable={false}
        />
        <div className='flex items-center gap-1.5'>
          <Button
            size='sm'
            variant='primary'
            disabled={!approveEnabled}
            loading={pending === 'approve'}
            onClick={approve}
          >
            Approve
          </Button>
          <Button
            size='sm'
            variant='secondary'
            disabled={!edited || pending !== null}
            loading={pending === 'save_copy'}
            onClick={() => onSaveCopy(copy)}
          >
            Save Draft
          </Button>
          <span className='ml-auto text-2xs text-tertiary-token'>
            {edited
              ? 'Edited · needs approval'
              : canApprove
                ? ''
                : 'Certify facts to approve'}
          </span>
        </div>
      </div>
    </DrawerSection>
  );
}

export function OutboundRail({
  row,
  certification,
  certificationLoading,
  activeFactKey,
  pending,
  error,
  onClose,
  onFact,
  onCertify,
  onApprove,
  onSaveCopy,
  onHold,
  onReject,
}: OutboundRailProps) {
  const [reason, setReason] = useState<OutboundRejectReason>('not_a_fit');
  const reject = useCallback(() => onReject(reason), [onReject, reason]);
  useRailCommand('reject', Boolean(row) && pending === null, reject);
  const grouped = useMemo(() => {
    const groups = new Map<
      ContactEvidenceItem['category'],
      ContactEvidenceItem[]
    >();
    for (const item of certification?.items ?? []) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return groups;
  }, [certification]);
  const certified = certification?.status === 'certified_for_outreach';

  return (
    <EntitySidebarShell
      isOpen={Boolean(row)}
      width={OUTBOUND_RAIL_WIDTH}
      ariaLabel='Outbound target'
      data-testid='outbound-rail'
      scrollStrategy='shell'
      onClose={onClose}
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      footerSurface='flat'
      isEmpty={!row}
      emptyMessage='Select a person to review their facts and message.'
      entityHeader={
        row ? (
          <div className='px-3 pt-3'>
            <EntityHeader
              thumbnail={
                <EntityHeaderThumbnail
                  variant='person'
                  src={row.avatarUrl}
                  name={row.name}
                />
              }
              title={row.name}
              subtitle={`@${row.handle} · ${OUTBOUND_VIEW_LABELS[row.view]}`}
              meta={
                <span className='text-xs text-secondary-token'>
                  {certification
                    ? humanize(certification.status)
                    : certificationLoading
                      ? 'Loading facts…'
                      : 'No canonical contact yet'}
                </span>
              }
            />
          </div>
        ) : undefined
      }
      footer={
        row ? (
          <div className='space-y-2 px-3 py-2'>
            <div className='flex items-center gap-1.5'>
              <Button
                size='sm'
                variant='secondary'
                disabled={pending !== null || row.approval.target === 'held'}
                loading={pending === 'hold'}
                onClick={onHold}
              >
                Hold
              </Button>
              <Select
                value={reason}
                onValueChange={value =>
                  setReason(value as OutboundRejectReason)
                }
              >
                <SelectTrigger className='w-32' aria-label='Reject Reason'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OUTBOUND_REJECT_REASONS.map(value => (
                    <SelectItem key={value} value={value}>
                      {OUTBOUND_REJECT_REASON_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size='sm'
                variant='tertiary'
                destructive
                className='ml-auto'
                disabled={pending !== null}
                loading={pending === 'reject'}
                onClick={reject}
              >
                Reject
              </Button>
            </div>
            <p
              role='status'
              aria-live='polite'
              className='min-h-4 text-2xs leading-4 text-destructive'
            >
              {error}
            </p>
          </div>
        ) : undefined
      }
    >
      {row ? (
        <>
          <MessageSection
            key={row.leadId}
            row={row}
            pending={pending}
            canApprove={certified}
            onApprove={onApprove}
            onSaveCopy={onSaveCopy}
          />
          <DrawerSection title='Profile' collapsible={false}>
            <div className='flex items-center gap-2 px-1 pb-2 text-xs'>
              {row.profilePath ? (
                <a
                  className='inline-flex items-center gap-1 text-link'
                  href={row.profilePath}
                  target='_blank'
                  rel='noreferrer'
                >
                  jov.ie{row.profilePath}
                  <ExternalLink className='h-3 w-3' aria-hidden='true' />
                </a>
              ) : (
                <span className='text-secondary-token'>
                  No Jovie profile built yet.
                </span>
              )}
              <a
                className='ml-auto inline-flex items-center gap-1 text-tertiary-token'
                href={row.sourceUrl}
                target='_blank'
                rel='noreferrer'
              >
                Source
                <ExternalLink className='h-3 w-3' aria-hidden='true' />
              </a>
            </div>
          </DrawerSection>
          <DrawerSection title='Certification' collapsible={false}>
            {certification ? (
              <div className='space-y-2 px-1 pb-2'>
                <p className='text-xs tabular-nums text-secondary-token'>
                  {(['confirmed', 'rejected', 'unresolved', 'stale'] as const)
                    .map(key => `${certification.coverage[key]} ${key}`)
                    .join(' · ')}
                </p>
                {certification.coverage.missingSourceClasses.length ? (
                  <p className='text-2xs text-secondary-token'>
                    Missing evidence:{' '}
                    {certification.coverage.missingSourceClasses.join(', ')}.
                    Certification waits for the resolver to find it.
                  </p>
                ) : null}
                <Button
                  size='sm'
                  variant='secondary'
                  className='w-full'
                  disabled={
                    !certification.canCertify || certified || pending !== null
                  }
                  loading={pending === 'certify'}
                  onClick={onCertify}
                >
                  {certified ? 'Certified' : 'Certify Current Facts'}
                </Button>
              </div>
            ) : (
              <p className='min-h-12 px-1 pb-2 text-xs text-secondary-token'>
                {certificationLoading
                  ? 'Loading discovered facts…'
                  : 'No canonical contact matches this lead yet.'}
              </p>
            )}
          </DrawerSection>
          {[...grouped].map(([category, items]) => (
            <DrawerSection key={category} title={humanize(category)}>
              {items.map(item => (
                <EvidenceItemCard
                  key={item.key}
                  item={item}
                  active={item.key === activeFactKey}
                  pending={pending === item.key}
                  onDecision={onFact}
                />
              ))}
            </DrawerSection>
          ))}
        </>
      ) : null}
    </EntitySidebarShell>
  );
}
