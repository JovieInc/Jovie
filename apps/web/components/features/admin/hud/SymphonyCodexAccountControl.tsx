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
  if (phase === 'confirmation' && confirming) {
    return `Reconnect ${confirming} with a one-time device login. Binding stays read-only.`;
  }
  if (phase === 'authorization-pending' && session) {
    return `Authorize ${session.account}: ${session.userCode ?? 'Waiting for device code'}. Visit ${session.verificationUri ?? 'https://auth.openai.com/codex/device'}.`;
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
  if (snapshot.binding.boundLabel) {
    return snapshot.binding.recognized
      ? `Binding review: ${snapshot.binding.boundLabel}. Switch and restart stay unavailable.`
      : `Binding review: ${snapshot.binding.boundLabel} is unrecognized and not selectable. Switch and restart stay unavailable.`;
  }
  return 'Binding review is read-only. Switch and restart stay unavailable.';
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
  const [snapshot, setSnapshot] = useState<CodexAccountControlSnapshot | null>(
    null
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

  const loadSnapshot = useCallback(
    async (mode: 'initial' | 'refresh' = 'refresh') => {
      if (mode === 'initial') setIsLoading(true);
      setFetchFailed(false);
      try {
        const parsed = await fetchSnapshot();
        if (!parsed) {
          setFetchFailed(true);
          setSnapshot(
            current =>
              current ?? emptyCodexAccountControlSnapshot('unavailable')
          );
          return;
        }
        setSnapshot(parsed);
      } catch {
        setFetchFailed(true);
        setSnapshot(
          current => current ?? emptyCodexAccountControlSnapshot('unavailable')
        );
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadSnapshot('initial');
  }, [loadSnapshot]);

  const phase = snapshot
    ? reconnectPhaseFromSnapshot(snapshot, confirming)
    : 'idle';

  useEffect(() => {
    if (phase !== 'authorization-pending') return;
    const timer = globalThis.setInterval(() => {
      void loadSnapshot('refresh');
    }, 2_000);
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

  const observation =
    isLoading && !snapshot
      ? 'loading'
      : fetchFailed
        ? 'unavailable'
        : snapshot?.availability === 'stale'
          ? 'stale'
          : snapshot
            ? 'fresh'
            : 'empty';
  const view = snapshot ?? emptyCodexAccountControlSnapshot('unavailable');
  const phaseTone =
    phase === 'succeeded'
      ? 'good'
      : phase === 'failed' || phase === 'expired'
        ? 'bad'
        : phase === 'authorization-pending' || phase === 'confirmation'
          ? 'warning'
          : 'neutral';

  return (
    <ContentSurfaceCard
      surface='details'
      className='min-h-56 space-y-3 p-3'
      data-testid='ovie-codex-account-control'
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
      {observation === 'loading' ? (
        <div
          className='grid min-h-36 gap-2'
          aria-hidden
          data-testid='ovie-codex-account-loading'
        >
          <div className='h-36 animate-pulse rounded-lg border border-subtle bg-surface-0 motion-reduce:animate-none' />
        </div>
      ) : null}
      {snapshot ? (
        <div className='space-y-3'>
          <ol
            className='grid min-h-36 gap-1'
            data-testid='ovie-codex-account-table'
          >
            {view.accounts.map(row => (
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
                    pending
                  }
                  aria-label={`Reconnect ${row.label}`}
                  data-testid={`ovie-codex-account-reconnect-${row.label}`}
                  ref={node => {
                    actionRefs.current[row.label] = node;
                  }}
                  onClick={() => {
                    setSelected(row.label);
                    setConfirming(row.label);
                    focusLabel.current = row.label;
                  }}
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
              {phaseMessage(view, phase, confirming)}
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
        </div>
      ) : null}
      {observation === 'unavailable' || observation === 'stale' ? (
        <HudObservationStatus
          state={observation}
          message={
            observation === 'stale'
              ? 'Codex account state is stale.'
              : 'Codex account control could not reach Gem.'
          }
          onRetry={() => void loadSnapshot('refresh')}
          testId='ovie-codex-account-observation'
        />
      ) : null}
    </ContentSurfaceCard>
  );
}
