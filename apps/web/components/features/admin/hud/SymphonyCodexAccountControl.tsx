'use client';

// @coverage-via apps/web/tests/unit/components/features/admin/hud/SymphonyCodexAccountControl.test.tsx

import { Button } from '@jovie/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { HudObservationStatus } from '@/components/features/admin/hud/HudObservationStatus';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  type ApprovedCodexAccountLabel,
  CODEX_ACCOUNT_STATE_LABELS,
  CODEX_RECONNECT_PHASE_LABELS,
  type CodexAccountControlSnapshot,
  type CodexReconnectPhase,
  emptyCodexAccountControlSnapshot,
  parseCodexAccountControlSnapshot,
  reconnectPhaseFromSnapshot,
} from '@/lib/hud/symphony-codex-accounts';

const FETCH_URL = '/api/admin/hud/symphony-codex-accounts';
const STATE_TONE = {
  verified: 'good',
  stale: 'warning',
  unknown: 'neutral',
  'usage-exhausted': 'bad',
} as const;

function phaseMessage(
  snapshot: CodexAccountControlSnapshot,
  phase: CodexReconnectPhase,
  confirming: ApprovedCodexAccountLabel | null
): string {
  const session = snapshot.session;
  const bound = snapshot.binding.boundLabel;
  if (phase === 'confirmation' && confirming) {
    return `Reconnect ${confirming} with a one-time device login. Binding stays read-only.`;
  }
  if (phase === 'authorization-pending' && session) {
    return `Authorize ${session.account}: ${session.userCode ?? 'Waiting for device code'}.`;
  }
  if (phase === 'succeeded' && session?.receipt) {
    return `Reconnected ${session.receipt.account}. Selected-account completion receipt stored.`;
  }
  if (phase === 'failed') {
    return snapshot.session?.error
      ? `Reconnect failed (${snapshot.session.error}).`
      : 'Reconnect failed.';
  }
  if (phase === 'expired') {
    return 'Authorization expired. Select an approved account to reconnect again.';
  }
  if (!bound) {
    return 'Binding review is read-only. Switch and restart stay unavailable.';
  }
  return snapshot.binding.recognized
    ? `Binding review: ${bound}. Switch and restart stay unavailable.`
    : `Binding review: ${bound} is unrecognized and not selectable. Switch and restart stay unavailable.`;
}

async function fetchSnapshot(init?: RequestInit) {
  const response = await fetch(FETCH_URL, {
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
    ...init,
  });
  if (!response.ok) return null;
  return parseCodexAccountControlSnapshot(await response.json());
}

export function SymphonyCodexAccountControl() {
  const [snapshot, setSnapshot] = useState(() =>
    emptyCodexAccountControlSnapshot('unavailable')
  );
  const [isLoading, setIsLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [confirming, setConfirming] =
    useState<ApprovedCodexAccountLabel | null>(null);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<ApprovedCodexAccountLabel | null>(
    null
  );
  const actionRefs = useRef<
    Partial<Record<ApprovedCodexAccountLabel, HTMLButtonElement | null>>
  >({});
  const focusLabel = useRef<ApprovedCodexAccountLabel | null>(null);

  const loadSnapshot = useCallback(async (initial = false) => {
    if (initial) setIsLoading(true);
    setFetchFailed(false);
    try {
      const parsed = await fetchSnapshot();
      if (parsed) setSnapshot(parsed);
      else setFetchFailed(true);
    } catch {
      setFetchFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot(true);
  }, [loadSnapshot]);

  const phase = reconnectPhaseFromSnapshot(snapshot, confirming);

  useEffect(() => {
    if (phase !== 'authorization-pending') return;
    const timer = globalThis.setInterval(() => void loadSnapshot(), 2_000);
    return () => globalThis.clearInterval(timer);
  }, [phase, loadSnapshot]);

  useEffect(() => {
    const label = focusLabel.current;
    if (label) actionRefs.current[label]?.focus();
  }, [phase, pending, snapshot]);

  const confirmReconnect = async () => {
    if (!confirming || pending) return;
    const account = confirming;
    setPending(true);
    try {
      const parsed = await fetchSnapshot({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, confirm: true }),
      });
      if (!parsed) {
        setFetchFailed(true);
        return;
      }
      setSnapshot(parsed);
      setConfirming(null);
      focusLabel.current = account;
    } catch {
      setFetchFailed(true);
    } finally {
      setPending(false);
    }
  };

  const observation = fetchFailed
    ? 'unavailable'
    : snapshot.availability === 'stale'
      ? 'stale'
      : null;
  const phaseTone =
    phase === 'succeeded'
      ? 'good'
      : phase === 'failed' || phase === 'expired'
        ? 'bad'
        : phase === 'authorization-pending' || phase === 'confirmation'
          ? 'warning'
          : 'neutral';
  const choose = (label: ApprovedCodexAccountLabel) => {
    setSelected(label);
    setConfirming(label);
    focusLabel.current = label;
  };

  return (
    <ContentSurfaceCard
      surface='details'
      className='min-h-56 space-y-3 p-3'
      data-testid='ovie-codex-account-control'
      data-loading={isLoading ? 'true' : 'false'}
    >
      <div className='flex min-h-6 items-center justify-between gap-2'>
        <p className='text-xs font-caption text-tertiary-token'>
          Symphony Codex Accounts
        </p>
        <HudStatusPill
          label={CODEX_RECONNECT_PHASE_LABELS[phase]}
          tone={phaseTone}
        />
      </div>
      <ol
        className='grid min-h-36 gap-1'
        data-testid={
          isLoading ? 'ovie-codex-account-loading' : 'ovie-codex-account-table'
        }
      >
        {snapshot.accounts.map(row => (
          <li
            key={row.label}
            className={`flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 py-1 ${selected === row.label ? 'bg-surface-2' : 'bg-transparent'}`}
            data-testid={`ovie-codex-account-row-${row.label}`}
            data-selected={selected === row.label ? 'true' : 'false'}
          >
            <button
              type='button'
              className='min-w-0 flex-1 truncate text-left text-app font-medium text-primary-token focus-ring-themed'
              onClick={() => setSelected(row.label)}
            >
              {row.label}
            </button>
            <HudStatusPill
              label={CODEX_ACCOUNT_STATE_LABELS[row.state]}
              tone={STATE_TONE[row.state]}
            />
            <Button
              type='button'
              variant='secondary'
              size='sm'
              disabled={
                snapshot.availability !== 'ready' ||
                !row.reconnectEligible ||
                pending ||
                isLoading
              }
              aria-label={`Reconnect ${row.label}`}
              data-testid={`ovie-codex-account-reconnect-${row.label}`}
              ref={node => {
                actionRefs.current[row.label] = node;
              }}
              onClick={() => choose(row.label)}
            >
              Reconnect
            </Button>
          </li>
        ))}
      </ol>
      <div
        className='min-h-16 rounded-lg border border-subtle bg-surface-0 px-3 py-2'
        data-testid='ovie-codex-account-status'
        data-phase={phase}
      >
        <p className='text-app leading-5 text-secondary-token'>
          {phaseMessage(snapshot, phase, confirming)}
        </p>
        {phase === 'confirmation' && confirming ? (
          <div className='mt-2 flex flex-wrap gap-2'>
            <Button
              type='button'
              size='sm'
              disabled={pending}
              data-testid='ovie-codex-account-confirm'
              onClick={() => void confirmReconnect()}
            >
              Confirm Reconnect
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              disabled={pending}
              data-testid='ovie-codex-account-cancel'
              onClick={() => {
                focusLabel.current = confirming;
                setConfirming(null);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
      {observation ? (
        <HudObservationStatus
          state={observation}
          message={
            observation === 'stale'
              ? 'Codex account state is stale.'
              : 'Codex account control could not reach Gem.'
          }
          onRetry={() => void loadSnapshot()}
          testId='ovie-codex-account-observation'
        />
      ) : null}
    </ContentSurfaceCard>
  );
}
