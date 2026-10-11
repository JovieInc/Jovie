'use client';

import { Button, ConfirmDialog, Textarea } from '@jovie/ui';
import {
  ClipboardCopy,
  ExternalLink,
  MonitorPlay,
  ShieldCheck,
} from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from '@/components/feedback';
import {
  DrawerCardActionBar,
  DrawerPropertyRow,
  DrawerSection,
  EntityHeader,
  EntityHeaderThumbnail,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { Tooltip } from '@/components/shell/Tooltip';
import {
  OVIE_CERTIFICATION_DOMAIN_LABELS,
  OVIE_CERTIFICATION_STATE_LABELS,
  OVIE_CERTIFICATION_TIER_LABELS,
  OVIE_CERTIFICATION_TIERS,
  type OvieCertificationDecisionKind,
  type OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import {
  canStartWalkthrough,
  walkthroughEvidenceHref,
} from '@/lib/ovie/certifications/walkthrough';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import {
  CertificationStateGlyph,
  CertificationTierGlyph,
} from './CertificationGlyphs';
import { evidenceForTier, shortSha } from './certification-view';

export const CERTIFICATION_RAIL_WIDTH = 400;

export interface CertificationDecisionHandler {
  (
    decision: OvieCertificationDecisionKind,
    notes: string | null
  ): Promise<boolean | void>;
}

interface CertificationDetailRailProps {
  readonly row: OvieCertificationRow | null;
  readonly onClose: () => void;
  readonly onDecide: CertificationDecisionHandler;
  readonly onWalkthrough?: () => void;
  readonly pendingDecision: OvieCertificationDecisionKind | null;
  readonly decisionError: string | null;
}

function EvidenceLink({
  href,
  label,
}: {
  readonly href: string;
  readonly label: string;
}) {
  return (
    <a
      href={href}
      target='_blank'
      rel='noreferrer'
      className='inline-flex min-w-0 items-center gap-1 text-xs text-secondary-token underline-offset-2 hover:text-primary-token hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/16'
    >
      <span className='truncate' title={label}>
        {label}
      </span>
      <ExternalLink className='h-3 w-3 shrink-0' aria-hidden='true' />
    </a>
  );
}

function EvidenceSection({ row }: { readonly row: OvieCertificationRow }) {
  return (
    <DrawerSection
      title='Evidence'
      surface='card'
      testId='certification-evidence'
    >
      <ul className='space-y-2'>
        {OVIE_CERTIFICATION_TIERS.map(tier => {
          const items = evidenceForTier(row, tier);
          return (
            <li key={tier} className='space-y-1'>
              <div className='flex items-center gap-2'>
                <CertificationTierGlyph tier={tier} status={row.tiers[tier]} />
                <span className='text-xs font-medium text-primary-token'>
                  {OVIE_CERTIFICATION_TIER_LABELS[tier]}
                </span>
                {tier === 'canonical_source' && row.source ? (
                  <span className='min-w-0 truncate text-xs text-tertiary-token'>
                    {row.source.repository}@{shortSha(row.source.sha)}
                  </span>
                ) : items.length === 0 ? (
                  <span className='text-xs text-quaternary-token'>
                    No receipt
                  </span>
                ) : null}
              </div>
              {items.length > 0 ? (
                <ul className='space-y-1 pl-4.5'>
                  {items.map(item => {
                    const href = walkthroughEvidenceHref(item);
                    return (
                      <li
                        key={`${item.tier}:${item.id}`}
                        className='flex min-w-0 items-start gap-2'
                      >
                        <CertificationTierGlyph
                          tier={item.tier}
                          status={item.status}
                          className='mt-1'
                        />
                        <div className='min-w-0 flex-1'>
                          <p className='text-xs leading-4 text-secondary-token'>
                            {item.summary || item.id}
                          </p>
                          {href ? (
                            <EvidenceLink href={href} label={item.ref} />
                          ) : item.ref ? (
                            <p className='truncate text-2xs text-tertiary-token'>
                              {item.ref}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </DrawerSection>
  );
}

function BlockersSection({ row }: { readonly row: OvieCertificationRow }) {
  if (row.blockers.length === 0 && !row.staleFounderLock) return null;
  return (
    <DrawerSection
      title='Blockers'
      surface='card'
      testId='certification-blockers'
    >
      <ul className='space-y-1.5'>
        {row.staleFounderLock ? (
          <li className='text-xs leading-4 text-warning'>
            A prior founder approval no longer matches the current evidence.
          </li>
        ) : null}
        {row.blockers.map(blocker => (
          <li
            key={`${blocker.code}:${blocker.tier}:${blocker.summary}`}
            className='text-xs leading-4 text-secondary-token'
          >
            {blocker.summary}
          </li>
        ))}
      </ul>
    </DrawerSection>
  );
}

function LinksSection({ row }: { readonly row: OvieCertificationRow }) {
  if (row.links.length === 0) return null;
  return (
    <DrawerSection title='Links' surface='card' testId='certification-links'>
      <ul className='space-y-1'>
        {row.links.map(link => (
          <li key={`${link.kind}:${link.href}`}>
            <EvidenceLink href={link.href} label={link.label} />
          </li>
        ))}
      </ul>
    </DrawerSection>
  );
}

function HistorySection({ row }: { readonly row: OvieCertificationRow }) {
  return (
    <DrawerSection
      title='History'
      defaultOpen={false}
      surface='card'
      testId='certification-history'
    >
      {row.history.length === 0 ? (
        <p className='text-xs text-tertiary-token'>No recorded events yet.</p>
      ) : (
        <ol className='space-y-1.5'>
          {row.history.map(event => (
            <li
              key={`${event.at}:${event.kind}:${event.type}:${event.summary}`}
              className='flex min-w-0 items-baseline gap-2'
            >
              <time
                dateTime={event.at}
                title={new Date(event.at).toLocaleString()}
                className='w-14 shrink-0 text-2xs tabular-nums text-tertiary-token'
              >
                {formatTimeAgo(event.at)}
              </time>
              <p className='min-w-0 flex-1 text-xs leading-4 text-secondary-token'>
                {event.summary}
                {event.actor ? (
                  <span className='text-tertiary-token'> · {event.actor}</span>
                ) : null}
              </p>
            </li>
          ))}
        </ol>
      )}
    </DrawerSection>
  );
}

function SourceSection({ row }: { readonly row: OvieCertificationRow }) {
  return (
    <DrawerSection title='Source' surface='card' defaultOpen={false}>
      <div className='space-y-1'>
        <DrawerPropertyRow
          label='Subject'
          labelWidth={72}
          value={<span className='break-all'>{row.subject.id}</span>}
        />
        {row.source && row.source.paths.length > 0 ? (
          <DrawerPropertyRow
            label='Paths'
            labelWidth={72}
            align='start'
            value={
              <span className='break-all'>{row.source.paths.join(', ')}</span>
            }
          />
        ) : null}
      </div>
    </DrawerSection>
  );
}

function DecisionFooter({
  row,
  onDecide,
  onWalkthrough,
  pendingDecision,
  decisionError,
}: {
  readonly row: OvieCertificationRow;
  readonly onDecide: CertificationDecisionHandler;
  readonly onWalkthrough?: () => void;
  readonly pendingDecision: OvieCertificationDecisionKind | null;
  readonly decisionError: string | null;
}) {
  const [notes, setNotes] = useState('');
  const [confirmReject, setConfirmReject] = useState(false);
  const notesId = useId();
  const trimmed = notes.trim();
  const busy = pendingDecision !== null;

  if (!row.decision.available) {
    return (
      <p
        className='min-h-8 text-xs leading-4 text-tertiary-token'
        data-testid='certification-decision-unavailable'
      >
        {row.decision.reason}
      </p>
    );
  }

  const decide = (decision: OvieCertificationDecisionKind) =>
    onDecide(decision, trimmed.length > 0 ? trimmed : null);

  return (
    <div className='space-y-2' data-testid='certification-decision'>
      {onWalkthrough && canStartWalkthrough(row) ? (
        <Button
          size='sm'
          variant='secondary'
          className='w-full'
          disabled={busy}
          data-testid='certification-walkthrough-action'
          onClick={onWalkthrough}
        >
          <MonitorPlay className='h-3.5 w-3.5' aria-hidden='true' />
          Walkthrough
        </Button>
      ) : null}
      <label htmlFor={notesId} className='sr-only'>
        Note for the worker
      </label>
      <Textarea
        id={notesId}
        value={notes}
        onChange={event => setNotes(event.target.value)}
        placeholder='Note for the worker (required to request changes)'
        textareaSize='sm'
        resizable={false}
        rows={2}
        disabled={busy}
      />
      <div className='flex items-center gap-1.5'>
        <Button
          size='sm'
          variant='primary'
          loading={pendingDecision === 'approved'}
          disabled={busy}
          onClick={() => void decide('approved')}
        >
          Certify
        </Button>
        <Button
          size='sm'
          variant='secondary'
          loading={pendingDecision === 'changes_requested'}
          disabled={busy || trimmed.length === 0}
          onClick={() => void decide('changes_requested')}
        >
          Request Changes
        </Button>
        <Button
          size='sm'
          variant='tertiary'
          destructive
          className='ml-auto'
          loading={pendingDecision === 'rejected'}
          disabled={busy}
          onClick={() => setConfirmReject(true)}
        >
          Reject
        </Button>
      </div>
      <p
        role='status'
        aria-live='polite'
        className='min-h-4 text-2xs leading-4 text-destructive'
      >
        {decisionError}
      </p>
      <ConfirmDialog
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title='Reject this certification?'
        description='The item returns to working. A new packet is needed before it can be reviewed again.'
        confirmLabel='Reject'
        variant='destructive'
        onConfirm={async () => {
          setConfirmReject(false);
          await decide('rejected');
        }}
      />
    </div>
  );
}

export function CertificationDetailRail({
  row,
  onClose,
  onDecide,
  onWalkthrough,
  pendingDecision,
  decisionError,
}: CertificationDetailRailProps) {
  const copySubjectId = async () => {
    if (!row) return;
    await navigator.clipboard.writeText(row.subject.id);
    toast.success('Copied subject ID');
  };

  return (
    <EntitySidebarShell
      isOpen={Boolean(row)}
      width={CERTIFICATION_RAIL_WIDTH}
      ariaLabel='Certification details'
      data-testid='certification-detail-rail'
      scrollStrategy='shell'
      onClose={onClose}
      headerMode='minimal'
      hideMinimalHeaderBar
      entityHeaderSurface='flat'
      footerSurface='flat'
      isEmpty={!row}
      emptyMessage='Select a certification to review its evidence.'
      entityHeader={
        row ? (
          <div className='px-3 pt-3'>
            <EntityHeader
              thumbnail={
                <EntityHeaderThumbnail
                  variant='connection'
                  name={row.subject.title}
                  icon={<ShieldCheck className='h-5 w-5' aria-hidden='true' />}
                />
              }
              title={row.subject.title}
              subtitle={`${OVIE_CERTIFICATION_DOMAIN_LABELS[row.domain]} · ${row.surface}`}
              statusGlyph={
                <Tooltip label={OVIE_CERTIFICATION_STATE_LABELS[row.state]}>
                  <span className='inline-flex'>
                    <CertificationStateGlyph state={row.state} />
                  </span>
                </Tooltip>
              }
              actions={
                <DrawerCardActionBar
                  primaryActions={[]}
                  overflowActions={[
                    {
                      id: 'copy-certification-subject',
                      label: 'Copy Subject ID',
                      icon: ClipboardCopy,
                      onClick: () => void copySubjectId(),
                    },
                  ]}
                  onClose={onClose}
                  overflowTriggerPlacement='card-top-right'
                  overflowTriggerIcon='vertical'
                  className='border-0 bg-transparent px-0 py-0'
                />
              }
            />
          </div>
        ) : undefined
      }
      footer={
        row ? (
          <DecisionFooter
            key={`${row.id}:${row.decision.evidenceDigest ?? 'none'}`}
            row={row}
            onDecide={onDecide}
            onWalkthrough={onWalkthrough}
            pendingDecision={pendingDecision}
            decisionError={decisionError}
          />
        ) : undefined
      }
    >
      {row ? (
        <>
          <BlockersSection row={row} />
          <EvidenceSection row={row} />
          <LinksSection row={row} />
          <HistorySection row={row} />
          <SourceSection row={row} />
        </>
      ) : null}
    </EntitySidebarShell>
  );
}
