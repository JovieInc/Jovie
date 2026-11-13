'use client';

import { Button } from '@jovie/ui';
import { DrawerSection } from '@/components/molecules/drawer';
import type { ContactCertificationInspection } from '@/lib/contacts/certification';
import {
  OUTBOUND_REJECT_REASON_LABELS,
  type OutboundRow,
} from '@/lib/outbound/types';

export interface OutboundRailReadinessProps {
  readonly row: OutboundRow;
  readonly certification: ContactCertificationInspection | null;
  readonly loading: boolean;
  readonly pending: string | null;
  readonly error?: string | null;
  readonly onRefreshEvidence: () => void;
  readonly onCertify: () => void;
  readonly onReviewFacts: () => void;
  readonly onReviewMessage: () => void;
}

/** Presentation of existing evidence only; this never grants approval or send authority. */
export function OutboundRailReadiness({
  row,
  certification,
  loading,
  pending,
  error = null,
  onRefreshEvidence,
  onCertify,
  onReviewFacts,
  onReviewMessage,
}: OutboundRailReadinessProps) {
  const certified = certification?.status === 'certified_for_outreach';
  const missing = [
    ...new Set([
      ...row.missingEvidence,
      ...(certification?.coverage.missingSourceClasses ?? []),
    ]),
  ];
  const unreachable =
    !row.channel ||
    (row.message !== null && row.message.channel !== row.channel);
  const facts = certification?.coverage;
  const lifecycle = {
    sent: 'Outreach queued or sent. Delivery is not confirmed here.',
    replied: 'Reply recorded. Signup is not recorded.',
    claimed: 'Signup recorded. Payment is not recorded.',
    paid: 'Payment recorded.',
  }[row.view as 'sent' | 'replied' | 'claimed' | 'paid'];
  const blockers = [
    error,
    lifecycle,
    row.approval.target === 'rejected' || row.view === 'rejected'
      ? `Rejected: ${row.approval.rejectReason ? OUTBOUND_REJECT_REASON_LABELS[row.approval.rejectReason] : 'reason not recorded'}.`
      : null,
    row.approval.target === 'held' || row.view === 'held'
      ? 'This person is on hold.'
      : null,
    row.approval.target === 'stale' || row.approval.copy === 'stale'
      ? 'Approval is stale; review the changed person or message.'
      : null,
    !row.profilePath ? 'No Jovie profile has been built.' : null,
    unreachable ? 'No reachable channel for this draft.' : null,
    row.view === 'needs_judge'
      ? 'The page and onboarding have not passed the dogfood judge.'
      : null,
    row.flags.includes('cold_draft_unavailable')
      ? 'Certified page facts or email compliance checks are missing.'
      : null,
    loading
      ? 'Current facts are loading.'
      : !certification
        ? 'Current certification is unknown.'
        : !certified
          ? certification.status === 'conflicted'
            ? 'Resolve conflicting facts before certification.'
            : certification.status === 'stale'
              ? 'Certification is stale; review the current facts.'
              : 'Current facts need certification.'
          : null,
    facts && (facts.unresolved || facts.stale || facts.rejected)
      ? [
          facts.unresolved
            ? `${facts.unresolved} unresolved fact${facts.unresolved === 1 ? '' : 's'}`
            : '',
          facts.stale
            ? `${facts.stale} stale fact${facts.stale === 1 ? '' : 's'}`
            : '',
          facts.rejected
            ? `${facts.rejected} rejected fact${facts.rejected === 1 ? '' : 's'}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : null,
    missing.length ? `Needs evidence: ${missing.join(', ')}.` : null,
    row.entityNote ? `Possible non-artist: ${row.entityNote}.` : null,
  ].filter((value): value is string => Boolean(value));

  const reviewFacts = certification?.items.length
    ? { label: 'Review Facts', run: onReviewFacts }
    : { label: 'Review Source', href: row.sourceUrl };
  let action: { label: string; run?: () => void; href?: string };
  if (!row.profilePath || unreachable || loading || !certification) {
    action = { label: 'Review Source', href: row.sourceUrl };
  } else if (
    row.approval.target === 'held' ||
    row.view === 'held' ||
    row.approval.target === 'rejected' ||
    row.view === 'rejected'
  ) {
    action = reviewFacts;
  } else if (lifecycle) {
    action = { label: 'Review Profile', href: row.profilePath };
  } else if (missing.length) {
    action = { label: 'Refresh Evidence', run: onRefreshEvidence };
  } else if (!certified) {
    action = certification.canCertify
      ? { label: 'Certify Current Facts', run: onCertify }
      : reviewFacts;
  } else if (
    !row.message ||
    row.view === 'needs_judge' ||
    row.flags.includes('cold_draft_unavailable')
  ) {
    action = { label: 'Review Profile', href: row.profilePath };
  } else {
    action = { label: 'Review Message', run: onReviewMessage };
  }

  return (
    <DrawerSection
      title='Readiness'
      collapsible={false}
      testId='outbound-readiness'
    >
      <div className='space-y-2 px-1 pb-2'>
        <ul
          className='space-y-1 text-xs text-secondary-token'
          data-testid='outbound-eligibility'
        >
          {blockers.length ? (
            blockers.map(blocker => (
              <li
                key={blocker}
                role={blocker === error ? 'alert' : undefined}
                className={blocker === error ? 'text-error' : undefined}
              >
                {blocker}
              </li>
            ))
          ) : (
            <li>
              Current facts are certified. Review the draft before approving.
            </li>
          )}
        </ul>
        <div data-testid='outbound-next-action'>
          {action.href ? (
            <a
              href={action.href}
              target='_blank'
              rel='noreferrer'
              className='text-xs font-medium text-link underline-offset-2 hover:underline'
            >
              {action.label}
            </a>
          ) : (
            <Button
              size='sm'
              variant='secondary'
              disabled={pending !== null}
              loading={pending === 'refresh_evidence' || pending === 'certify'}
              onClick={action.run}
            >
              {action.label}
            </Button>
          )}
        </div>
        <p className='text-2xs text-tertiary-token'>
          Draft review only. Sending remains closed.
        </p>
      </div>
    </DrawerSection>
  );
}
