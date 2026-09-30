'use client';

import { Button } from '@jovie/ui';
import { useEffect, useState } from 'react';
import {
  getWorkspacePrivacyLockState,
  lockWorkspace,
  updateWorkspacePrivacyLock,
  type WorkspacePrivacyLockState,
} from '@/lib/workspace-lock/workspace-lock';

export function OviePrivacyLockControl({
  ensurePrivacyLockCanBeEnabled,
}: {
  ensurePrivacyLockCanBeEnabled: () => Promise<void>;
}) {
  const [state, setState] = useState<WorkspacePrivacyLockState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getWorkspacePrivacyLockState()
      .then(next => {
        if (active) setState(next);
      })
      .catch(caught => {
        if (active) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Could not load Ovie privacy settings.'
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!state?.enabled || state.locked) return;
    const deadline = state.unlockedUntil
      ? Date.parse(state.unlockedUntil)
      : NaN;
    if (!Number.isFinite(deadline)) {
      setState({ ...state, locked: true });
      return;
    }
    const timer = window.setTimeout(
      () =>
        setState(current => (current ? { ...current, locked: true } : current)),
      Math.max(0, deadline - Date.now())
    );
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      getWorkspacePrivacyLockState()
        .then(setState)
        .catch(() =>
          setState(current =>
            current ? { ...current, locked: true } : current
          )
        );
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  async function handleAction() {
    if (!state || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!state.enabled) {
        await ensurePrivacyLockCanBeEnabled();
        const enabled = await updateWorkspacePrivacyLock('enable');
        if (!enabled.enabled || !enabled.locked) {
          throw new Error(
            'Ovie did not confirm privacy protection. Try again.'
          );
        }
        setState(enabled);
        globalThis.location?.reload();
        return;
      }

      if (state.locked) return;
      if (
        state.unlockedUntil &&
        Date.parse(state.unlockedUntil) <= Date.now()
      ) {
        setState({ ...state, locked: true });
        globalThis.location?.reload();
        return;
      }

      if (state.enabled && !state.locked) {
        const disabled = await updateWorkspacePrivacyLock('disable');
        if (disabled.enabled || disabled.locked) {
          throw new Error(
            'Ovie did not confirm the setting change. Try again.'
          );
        }
        setState(disabled);
        globalThis.location?.reload();
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not change Ovie privacy settings.'
      );
    } finally {
      setBusy(false);
    }
  }

  if (state?.enabled && state.locked) {
    return (
      <div className='px-3 py-2' data-testid='ovie-privacy-lock-control'>
        <p className='text-xs font-medium text-primary-token'>Ovie is locked</p>
        <p className='mt-0.5 text-2xs text-secondary-token'>
          Unlock with your passkey to continue.
        </p>
      </div>
    );
  }

  const actionLabel = !state
    ? 'Loading privacy settings…'
    : state.enabled
      ? 'Turn off Ovie privacy lock'
      : 'Enable Ovie privacy lock';

  return (
    <div className='px-3 py-2' data-testid='ovie-privacy-lock-control'>
      <p className='text-xs font-medium text-primary-token'>
        Ovie privacy lock
      </p>
      <p className='mt-0.5 text-2xs text-secondary-token'>
        {state?.enabled
          ? 'On · unlocked for up to 24 hours'
          : 'Off · requires an existing admin passkey'}
      </p>
      <Button
        className='mt-1 w-full justify-start'
        disabled={!state || busy}
        onClick={() => void handleAction()}
        size='sm'
        variant='ghost'
      >
        {busy ? 'Updating…' : actionLabel}
      </Button>
      {error ? (
        <p className='mt-1 text-2xs text-destructive' role='alert'>
          {error}
        </p>
      ) : null}
      {state?.enabled && !state.locked ? (
        <Button
          className='mt-1 w-full justify-start'
          disabled={busy}
          onClick={() =>
            void Promise.resolve()
              .then(lockWorkspace)
              .catch(caught =>
                setError(
                  caught instanceof Error
                    ? caught.message
                    : 'Could not lock Ovie.'
                )
              )
          }
          size='sm'
          variant='ghost'
        >
          Lock Ovie Now
        </Button>
      ) : null}
    </div>
  );
}
