'use client';

import {
  Button,
  ConfirmDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { humanize } from '@/components/features/admin/contacts-table/AdminContactsTable';
import {
  DrawerSection,
  EntityHeader,
  EntityHeaderThumbnail,
} from '@/components/molecules/drawer';
import { AdminDetailRail } from '@/features/admin/layout/AdminDetailRail';
import type {
  ContactCertificationInspection,
  ContactEvidenceDecision,
  ContactEvidenceItem,
} from '@/lib/contacts/certification';
import {
  OUTBOUND_REJECT_REASON_LABELS,
  OUTBOUND_REJECT_REASONS,
  type OutboundCopy,
  type OutboundRejectReason,
  type OutboundRow,
} from '@/lib/outbound/types';
import { OutboundRailFact } from './OutboundRailFact';
import { OutboundRailReadiness } from './OutboundRailReadiness';
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
  /** Re-collect public evidence for a built profile; sends nothing. */
  readonly onRefreshEvidence: () => void;
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
    return 'Draft approved; sending remains closed';
  if (row.approval.copy === 'draft' && row.message?.revision)
    return 'Edited draft, not approved';
  return 'Not approved';
}

function MessageSection({
  row,
  pending,
  canApprove,
  blockedReason,
  onApprove,
  onSaveCopy,
}: Readonly<{
  row: OutboundRow;
  pending: string | null;
  canApprove: boolean;
  /** Why Approve is disabled, shown in place of the edit hint. */
  blockedReason: string;
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
      <p
        className='px-1 pb-2 text-xs text-secondary-token'
        data-testid='outbound-message-empty'
      >
        {row.view === 'needs_judge'
          ? 'Draft hidden until the page and onboarding pass the dogfood judge.'
          : row.flags.includes('cold_draft_unavailable')
            ? 'Draft hidden until certified page facts and email compliance checks are available.'
            : row.channel
              ? 'No draft is available for this profile yet.'
              : 'No reachable channel: no email address or Instagram handle on file.'}
      </p>
    );
  }
  const edited =
    body !== message.body ||
    (message.channel === 'email' && subject !== (message.subject ?? ''));
  return (
    <DrawerSection title='Message' collapsible={false}>
      <div className='space-y-2 px-1 pb-2'>
        <p className='text-2xs text-tertiary-token'>
          {message.channel === 'email' ? 'Email' : 'Instagram DM'}
          {message.channel === row.channel ? '' : ' (no recipient on file)'} ·{' '}
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
                : blockedReason}
          </span>
        </div>
      </div>
    </DrawerSection>
  );
}

function OutboundRailContent({
  row,
  certification,
  certificationLoading,
  activeFactKey,
  pending,
  error,
  onClose,
  onFact,
  onCertify,
  onRefreshEvidence,
  onApprove,
  onSaveCopy,
  onHold,
  onReject,
}: OutboundRailProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState<OutboundRejectReason>('not_a_fit');
  const [confirmReject, setConfirmReject] = useState(false);
  const reject = useCallback(() => setConfirmReject(true), []);
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
    <AdminDetailRail
      isOpen={Boolean(row)}
      ariaLabel='Outbound target'
      data-testid='outbound-rail'
      scrollStrategy='shell'
      onClose={onClose}
      headerMode='minimal'
      hideMinimalHeaderBar
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
              subtitle={`@${row.handle}`}
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
                className='ml-auto'
                disabled={pending !== null}
                loading={pending === 'reject'}
                onClick={reject}
              >
                Reject
              </Button>
            </div>
            <ConfirmDialog
              open={confirmReject}
              onOpenChange={setConfirmReject}
              title={`Reject ${row.name}?`}
              description={`Reason: ${OUTBOUND_REJECT_REASON_LABELS[reason]}. The reason feeds qualification learning, and you can approve them later.`}
              confirmLabel='Reject'
              variant='destructive'
              onConfirm={() => {
                setConfirmReject(false);
                onReject(reason);
              }}
            />
          </div>
        ) : undefined
      }
    >
      {row ? (
        <div ref={contentRef} className='space-y-2.5'>
          <OutboundRailReadiness
            row={row}
            certification={certification}
            loading={certificationLoading}
            pending={pending}
            error={error}
            onRefreshEvidence={onRefreshEvidence}
            onCertify={onCertify}
            onReviewFacts={() => {
              const root = contentRef.current;
              const active = root?.querySelector<HTMLButtonElement>(
                '[aria-current="true"] fieldset button'
              );
              (
                active ??
                root?.querySelector<HTMLButtonElement>('fieldset button')
              )?.focus();
            }}
            onReviewMessage={() =>
              contentRef.current
                ?.querySelector<HTMLTextAreaElement>('textarea')
                ?.focus()
            }
          />
          <MessageSection
            key={row.leadId}
            row={row}
            pending={pending}
            canApprove={
              certified &&
              row.channel !== null &&
              row.message?.channel === row.channel
            }
            blockedReason={
              row.channel === null || row.message?.channel !== row.channel
                ? 'No reachable channel.'
                : certification?.status === 'conflicted'
                  ? 'Resolve the conflict to approve.'
                  : 'Certify facts to approve.'
            }
            onApprove={onApprove}
            onSaveCopy={onSaveCopy}
          />
          <nav
            aria-label='Profile And Source'
            className='flex flex-wrap items-center gap-2 px-1 pb-2 text-xs'
          >
            {row.profilePath ? (
              <a
                className='inline-flex min-w-0 max-w-full items-center gap-1 text-primary-token underline-offset-2 hover:underline'
                href={row.profilePath}
                target='_blank'
                rel='noreferrer'
              >
                <span className='min-w-0 break-all'>
                  jov.ie{row.profilePath}
                </span>
                <ExternalLink className='h-3 w-3 shrink-0' aria-hidden='true' />
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
          </nav>
          {certification ? (
            <DrawerSection title='Certification details' defaultOpen={false}>
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
                <p className='break-all text-2xs text-tertiary-token'>
                  Evidence revision: {certification.evidenceRevision}
                </p>
              </div>
            </DrawerSection>
          ) : null}
          {[...grouped].map(([category, items]) => (
            <DrawerSection
              key={category}
              title={humanize(category)}
              collapsible={false}
            >
              {items.map(item => (
                <OutboundRailFact
                  key={`${item.key}:${item.revision}`}
                  item={item}
                  active={item.key === activeFactKey}
                  pending={pending === item.key}
                  onDecision={onFact}
                />
              ))}
            </DrawerSection>
          ))}
        </div>
      ) : null}
    </AdminDetailRail>
  );
}

/** Person navigation resets draft edits, corrections, disclosures and rejection confirmation. */
export function OutboundRail(props: OutboundRailProps) {
  return <OutboundRailContent key={props.row?.leadId ?? 'empty'} {...props} />;
}
