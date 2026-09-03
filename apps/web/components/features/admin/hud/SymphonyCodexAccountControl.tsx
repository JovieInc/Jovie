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
  type CodexAccountState,
  type CodexReconnectPhase,
  emptyCodexAccountControlSnapshot,
  parseCodexAccountControlSnapshot,
  reconnectPhaseFromSnapshot,
} from '@/lib/hud/symphony-codex-accounts';

const FETCH_URL = '/api/admin/hud/symphony-codex-accounts';
const FETCH_TIMEOUT_MS = 12_000;
const POLL_MS = 2_000;

const STATE_TONE: Record<
  CodexAccountState,
  'good' | 'warning' | 'bad' | 'neutral'
> = {
  verified: 'good',
  stale: 'warning',
  unknown: 'neutral',
  'usage-exhausted': 'bad',
};

function phaseMessage(
  snapshot: CodexAccountControlSnapshot,
  phase: CodexReconnectPhase,
  confirming: ApprovedCodexAccountLabel | null
): string {
  if (phase === 'confirmation' && confirming) {
    return `Reconnect ${confirming} with a one-time device login. Binding stays read-only.`;
  }
  const session = snapshot.session;
  if (phase === 'authorization-pending' && session) {
    const code = session.userCode ?? 'Waiting for device code';
    const uri =
      session.verificationUri ?? 'https://auth.openai.com/codex/device';
    return `Authorize ${session.account}: ${code}. Visit ${uri}.`;
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
  if (snapshot.binding.recognized) {
    return `Binding review: ${snapshot.binding.boundLabel}. Switch and restart stay unavailable.`;
  }
  if (snapshot.binding.boundLabel) {
    return `Binding review: ${snapshot.binding.boundLabel} is unrecognized and not selectable. Switch and restart stay unavailable.`;
  }
  return 'Binding review is read-only. Switch and restart stay unavailable.';
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
        const response = await fetch(FETCH_URL, {
          cache: 'no-store',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
          setFetchFailed(true);
          setSnapshot(
            current =>
              current ??
              emptyCodexAccountControlSnapshot(
                'unavailable',
                'Gem Codex account control is unavailable.'
              )
          );
          return;
        }
        const parsed = parseCodexAccountControlSnapshot(await response.json());
        if (!parsed) {
          setFetchFailed(true);
          setSnapshot(
            current =>
              current ??
              emptyCodexAccountControlSnapshot(
                'unavailable',
                'Gem Codex account control returned an unreadable snapshot.'
              )
          );
          return;
        }
        setSnapshot(parsed);
      } catch {
        setFetchFailed(true);
        setSnapshot(
          current =>
            current ??
            emptyCodexAccountControlSnapshot(
              'unavailable',
              'Gem Codex account control is unavailable.'
            )
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
  const shouldPoll = phase === 'authorization-pending';

  useEffect(() => {
    if (!shouldPoll) return;
    const timer = globalThis.setInterval(() => {
      void loadSnapshot('refresh');
    }, POLL_MS);
    return () => globalThis.clearInterval(timer);
  }, [shouldPoll, loadSnapshot]);

  useEffect(() => {
    const label = focusLabel.current;
    if (!label) return;
    actionRefs.current[label]?.focus();
  }, [phase, pending, snapshot]);

  const startConfirm = (label: ApprovedCodexAccountLabel) => {
    setSelected(label);
    setConfirming(label);
    focusLabel.current = label;
  };

  const cancelConfirm = () => {
    focusLabel.current = confirming;
    setConfirming(null);
  };

  const confirmReconnect = async () => {
    if (!confirming || pending) return;
    const account = confirming;
    setPending(true);
    try {
      const response = await fetch(FETCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        body: JSON.stringify({ account, confirm: true }),
      });
      if (!response.ok) {
        setFetchFailed(true);
        return;
      }
      const parsed = parseCodexAccountControlSnapshot(await response.json());
      if (parsed) setSnapshot(parsed);
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
  const statusCopy = phaseMessage(view, phase, confirming);

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
          tone={
            phase === 'succeeded'
              ? 'good'
              : phase === 'failed' || phase === 'expired'
                ? 'bad'
                : phase === 'authorization-pending' || phase === 'confirmation'
                  ? 'warning'
                  : 'neutral'
          }
        />
      </div>
      {observation === 'loading' ? (
        <div
          className='grid min-h-36 gap-2'
          aria-hidden
          data-testid='ovie-codex-account-loading'
        >
          {[1, 2, 3].map(slot => (
            <div
              key={slot}
              className='h-10 animate-pulse rounded-lg border border-subtle bg-surface-0 motion-reduce:animate-none'
            />
          ))}
        </div>
      ) : null}
      {snapshot ? (
        <div className='space-y-3'>
          <ol
            className='grid min-h-36 gap-1'
            data-testid='ovie-codex-account-table'
          >
            {view.accounts.map(row => {
              const selectedRow = selected === row.label;
              const reconnectEnabled =
                snapshot.availability === 'ready' &&
                row.reconnectEligible &&
                !pending;
              return (
                <li key={row.label}>
                  <div
                    className={`flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 py-1 ${
                      selectedRow ? 'bg-surface-2' : 'bg-transparent'
                    }`}
                    data-testid={`ovie-codex-account-row-${row.label}`}
                    data-selected={selectedRow ? 'true' : 'false'}
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
                      disabled={!reconnectEnabled}
                      aria-label={`Reconnect ${row.label}`}
                      data-testid={`ovie-codex-account-reconnect-${row.label}`}
                      ref={node => {
                        actionRefs.current[row.label] = node;
                      }}
                      onClick={() => startConfirm(row.label)}
                    >
                      Reconnect
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
          <div
            className='min-h-16 rounded-lg border border-subtle bg-surface-0 px-3 py-2'
            data-testid='ovie-codex-account-status'
            data-phase={phase}
          >
            <p className='text-app leading-5 text-secondary-token'>
              {statusCopy}
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
                  onClick={cancelConfirm}
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
