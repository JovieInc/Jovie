'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from '@/components/feedback';
import { ShellListRowFrame } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import type { CertificationInboxItem } from '@/lib/agent-os/certification-inbox';
import {
  OVIE_CERTIFICATION_DOMAIN_LABELS,
  OVIE_CERTIFICATION_INVENTORY_CONTRACT,
  type OvieCertificationDecisionKind,
  type OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import { FetchError } from '@/lib/queries/fetch';
import {
  getCertificationDecisionErrorMessage,
  useOvieCertificationDecisionMutation,
  useOvieCertificationsQuery,
} from '@/lib/queries/useOvieCertificationsQuery';
import { HudObservationStatus } from './hud/HudObservationStatus';

const DECISION_LABELS: Record<OvieCertificationDecisionKind, string> = {
  approved: 'Certify',
  changes_requested: 'Request changes',
  rejected: 'Reject',
};

const DECISION_TOASTS: Record<OvieCertificationDecisionKind, string> = {
  approved: 'Certified',
  changes_requested: 'Changes requested',
  rejected: 'Rejected',
};

/** Decisions that carry the founder's written reason to the worker. */
const NOTE_REQUIRED: ReadonlySet<OvieCertificationDecisionKind> = new Set([
  'changes_requested',
]);

interface JudgmentRowProps {
  readonly item: CertificationInboxItem;
  readonly row: OvieCertificationRow | undefined;
  readonly pendingKind: OvieCertificationDecisionKind | null;
  readonly onDecide: (
    item: CertificationInboxItem,
    row: OvieCertificationRow,
    kind: OvieCertificationDecisionKind,
    notes: string | null
  ) => Promise<boolean>;
}

function JudgmentRow({
  item,
  row,
  pendingKind,
  onDecide,
}: Readonly<JudgmentRowProps>) {
  const [armedKind, setArmedKind] =
    useState<OvieCertificationDecisionKind | null>(null);
  const [note, setNote] = useState('');

  const evidenceDigest =
    row?.decision.evidenceDigest ?? item.decisionEvidenceDigest;
  const canDecide = Boolean(row?.decision.available && evidenceDigest);
  const blockedReason =
    row?.decision.reason ??
    'This judgment has no connected certification decision path.';
  const domainLabel = row
    ? `${OVIE_CERTIFICATION_DOMAIN_LABELS[row.domain]} · ${row.surface}`
    : item.domain;

  const confirm = async (kind: OvieCertificationDecisionKind) => {
    const trimmed = kind === 'approved' ? '' : note.trim();
    if (NOTE_REQUIRED.has(kind) && trimmed.length === 0) {
      toast.error('Add a note so the worker knows what to change.');
      return;
    }
    if (!row) return;
    if (await onDecide(item, row, kind, trimmed.length > 0 ? trimmed : null)) {
      setArmedKind(null);
      setNote('');
    }
  };

  return (
    <ShellListRowFrame
      className='px-3 py-2'
      data-testid={`needs-you-judgment-${item.subject.id}`}
    >
      <div className='flex items-start gap-3'>
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-1.5'>
            <Link
              href={`${APP_ROUTES.ADMIN_CERTIFICATIONS}?row=${encodeURIComponent(row?.id ?? `${item.domain}:${item.subject.id}`)}`}
              className='group flex min-w-0 items-center gap-1.5'
            >
              <p className='truncate text-app font-semibold text-primary-token transition-colors group-hover:text-warning group-focus-visible:text-warning'>
                {item.subject.title}
              </p>
              <ArrowUpRight
                className='h-3 w-3 shrink-0 text-tertiary-token opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100'
                aria-hidden='true'
              />
            </Link>
            {item.staleFounderLock ? (
              <AlertTriangle
                className='h-3 w-3 shrink-0 text-warning'
                aria-label='Prior Approval Is Stale — Evidence Changed'
              />
            ) : null}
          </div>
          <p className='mt-0.5 text-2xs text-tertiary-token'>
            {domainLabel}
            {item.requestedDecision
              ? ` · ${item.requestedDecision}`
              : ' · Review-ready packet awaiting a founder judgment.'}
            {item.estimatedFounderMinutes > 0
              ? ` · ~${item.estimatedFounderMinutes} min`
              : ''}
          </p>
        </div>
      </div>

      {canDecide ? (
        <div className='mt-2 space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            {(['approved', 'changes_requested', 'rejected'] as const).map(
              kind => (
                <Button
                  key={kind}
                  type='button'
                  size='sm'
                  variant={
                    kind === 'approved'
                      ? 'primary'
                      : armedKind === kind
                        ? 'secondary'
                        : 'ghost'
                  }
                  disabled={pendingKind !== null}
                  onClick={() => {
                    if (kind === 'approved') {
                      void confirm(kind);
                      return;
                    }
                    setArmedKind(current => (current === kind ? null : kind));
                    setNote('');
                  }}
                  aria-label={`${DECISION_LABELS[kind]} "${item.subject.title}"`}
                >
                  {pendingKind === kind ? 'Recording…' : DECISION_LABELS[kind]}
                </Button>
              )
            )}
          </div>
          {armedKind ? (
            <div className='space-y-1.5'>
              <label className='block'>
                <span className='sr-only'>
                  Note for {DECISION_LABELS[armedKind]}
                </span>
                <input
                  type='text'
                  value={note}
                  disabled={pendingKind !== null}
                  onChange={event => setNote(event.target.value)}
                  placeholder={
                    armedKind === 'changes_requested'
                      ? 'What should change? (required)'
                      : 'Why reject? (optional)'
                  }
                  className='w-full rounded-lg border border-(--app-shell-border) bg-surface-1 px-3 py-1.5 text-xs text-primary-token outline-none placeholder:text-tertiary-token focus-visible:ring-2 focus-visible:ring-ring'
                />
              </label>
              <div className='flex items-center gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  disabled={pendingKind !== null}
                  onClick={() => void confirm(armedKind)}
                >
                  Confirm {DECISION_LABELS[armedKind]}
                </Button>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  disabled={pendingKind !== null}
                  onClick={() => {
                    setArmedKind(null);
                    setNote('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className='mt-2 text-2xs leading-4 text-tertiary-token'>
          {blockedReason}
        </p>
      )}
    </ShellListRowFrame>
  );
}

/**
 * Canonical founder judgments (jovie.certification-inbox/v1) projected into
 * Needs You. Decisions land through POST /api/ovie/certifications/decisions —
 * the same authoritative path the Certifications workspace uses — so a
 * judgment resolved here is resolved everywhere, and a Linear task close can
 * never stand in for one.
 */
export function CertificationJudgments() {
  const query = useOvieCertificationsQuery();
  const mutation = useOvieCertificationDecisionMutation();
  const { refetch } = query;
  const { mutateAsync } = mutation;
  const inFlight = useRef(new Set<string>());
  const [pendingKinds, setPendingKinds] = useState<
    ReadonlyMap<string, OvieCertificationDecisionKind>
  >(new Map());

  const inventory =
    query.data?.contract === OVIE_CERTIFICATION_INVENTORY_CONTRACT
      ? query.data
      : undefined;
  const judgments = useMemo(() => inventory?.queue.needsYou ?? [], [inventory]);
  const rowBySubject = useMemo(
    () =>
      new Map<string, OvieCertificationRow>(
        (inventory?.rows ?? []).map(
          row => [`${row.domain}:${row.subject.id}`, row] as const
        )
      ),
    [inventory]
  );

  const handleDecide = useCallback(
    async (
      item: CertificationInboxItem,
      row: OvieCertificationRow,
      kind: OvieCertificationDecisionKind,
      notes: string | null
    ) => {
      const evidenceDigest =
        row.decision.evidenceDigest ?? item.decisionEvidenceDigest;
      if (!evidenceDigest || inFlight.current.has(row.id)) return false;
      inFlight.current.add(row.id);
      setPendingKinds(previous => new Map(previous).set(row.id, kind));
      try {
        await mutateAsync({
          rowId: row.id,
          evidenceDigest,
          decision: kind,
          notes,
          actionId: crypto.randomUUID(),
        });
        toast.success(DECISION_TOASTS[kind]);
        return true;
      } catch (error) {
        toast.error(getCertificationDecisionErrorMessage(error));
        void refetch();
        return false;
      } finally {
        inFlight.current.delete(row.id);
        setPendingKinds(previous => {
          const next = new Map(previous);
          next.delete(row.id);
          return next;
        });
      }
    },
    [mutateAsync, refetch]
  );

  if (query.isLoading && !inventory) {
    return (
      <div className='grid gap-2' data-testid='needs-you-judgments-loading'>
        {[1].map(i => (
          <div
            key={i}
            className='h-13 animate-pulse rounded-md bg-surface-1'
            aria-hidden='true'
          />
        ))}
      </div>
    );
  }

  if (!inventory && (query.isError || query.data !== undefined)) {
    const locked =
      query.error instanceof FetchError && query.error.status === 403;
    return (
      <HudObservationStatus
        state='unavailable'
        message={
          locked
            ? 'Certification judgments are locked. Unlock admin with your passkey, then retry.'
            : 'Certification judgments could not be loaded.'
        }
        onRetry={() => {
          void query.refetch();
        }}
        testId='needs-you-judgments-observation'
      />
    );
  }

  if (judgments.length === 0) {
    const covered = inventory?.domains.some(
      domain => domain.status === 'connected'
    );
    return covered ? null : (
      <HudObservationStatus
        state='empty'
        message='No certification domains are connected yet; coverage is partial and no judgment queue exists.'
        testId='needs-you-judgments-observation'
      />
    );
  }

  return (
    <div className='grid gap-2' data-testid='needs-you-judgments'>
      {judgments.map(item => {
        const row = rowBySubject.get(`${item.domain}:${item.subject.id}`);
        const pendingKind = row ? (pendingKinds.get(row.id) ?? null) : null;
        return (
          <JudgmentRow
            key={`${item.domain}:${item.subject.id}`}
            item={item}
            row={row}
            pendingKind={pendingKind}
            onDecide={handleDecide}
          />
        );
      })}
    </div>
  );
}
