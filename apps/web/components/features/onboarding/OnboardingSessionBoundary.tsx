'use client';

import { Button } from '@jovie/ui';
import type { UIMessage } from 'ai';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { useJovieAuth } from '@/hooks/useJovieAuth';
import { OnboardingShell, type OnboardingShellProps } from './OnboardingShell';

export interface OnboardingSessionSnapshot {
  readonly identityId: string | null;
  readonly conversationId: string | null;
  readonly owned: boolean;
  readonly messages: UIMessage[];
}
type Snapshot = OnboardingSessionSnapshot;

export interface OnboardingSessionBoundaryProps extends OnboardingShellProps {
  /**
   * Server-resolved snapshot for a visitor with no account and no onboarding
   * cookie, whose restored conversation is known to be empty. Skips the
   * hydrate -> auth -> fetch waterfall so the real chat paints with the HTML
   * instead of "Restoring your conversation". Ignored if the client resolves
   * to a different identity.
   */
  readonly initialSnapshot?: OnboardingSessionSnapshot;
}

/** Resolve history before mounting useChat, and discard it on identity changes. */
export function OnboardingSessionBoundary({
  initialSnapshot,
  ...props
}: OnboardingSessionBoundaryProps) {
  const { isLoaded, isSignedIn, userId, signOut } = useJovieAuth();
  const identity = isLoaded
    ? (userId ?? 'anonymous')
    : initialSnapshot
      ? 'anonymous'
      : null;
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{
    identity: string;
    revision: number;
    snapshot: Snapshot;
    allowHandoff: boolean;
  } | null>(
    initialSnapshot
      ? {
          identity: 'anonymous',
          revision: 0,
          snapshot: initialSnapshot,
          allowHandoff: true,
        }
      : null
  );
  const [failure, setFailure] = useState<{
    identity: string;
    revision: number;
  } | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const actionIdentity = useRef(identity);
  useLayoutEffect(() => {
    actionIdentity.current = identity;
  }, [identity]);
  const initialIdentity = useRef<string | null>(null);

  useEffect(() => {
    if (!identity) return;
    initialIdentity.current ??= identity;
    // The server already resolved this exact identity and revision.
    if (loaded?.identity === identity && loaded.revision === revision) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/onboarding/conversation', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('restore failed');
        const snapshot: Snapshot = await response.json();
        if (
          (snapshot.identityId ?? 'anonymous') !== identity ||
          !Array.isArray(snapshot.messages) ||
          typeof snapshot.owned !== 'boolean' ||
          (snapshot.conversationId !== null &&
            typeof snapshot.conversationId !== 'string')
        )
          throw new Error('invalid restore');
        if (!cancelled)
          setLoaded({
            identity,
            revision,
            snapshot,
            allowHandoff:
              revision === 0 &&
              snapshot.messages.length === 0 &&
              initialIdentity.current === identity,
          });
      } catch {
        if (!cancelled) setFailure({ identity, revision });
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
    // `loaded` is read only to skip the seeded first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, revision]);

  const runAction = async (action: 'restart' | 'logout') => {
    if (actionPending || chatBusy || !identity) return;
    const owner = identity;
    setActionPending(true);
    setActionError(null);
    try {
      const response = await fetch('/api/onboarding/conversation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          identityId: userId,
          conversationId: loaded?.snapshot.conversationId ?? null,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('action failed');
      if (actionIdentity.current !== owner) return;
      if (action === 'logout') await signOut({ redirectUrl: APP_ROUTES.START });
      else {
        // Remove URL handoffs too: reload must not resubmit the old starter.
        globalThis.history.replaceState(null, '', APP_ROUTES.START);
        setRevision(current => current + 1);
      }
    } catch {
      if (actionIdentity.current === owner)
        setActionError(
          action === 'logout'
            ? 'We could not log you out. Try again.'
            : 'We could not start a new conversation. Try again.'
        );
    } finally {
      setActionPending(false);
    }
  };

  if (
    !identity ||
    loaded?.identity !== identity ||
    loaded.revision !== revision
  ) {
    const failed =
      failure?.identity === identity && failure.revision === revision;
    return (
      <div
        className='flex min-h-0 flex-1 flex-col items-center justify-center gap-3'
        role={failed ? 'alert' : 'status'}
        aria-live='polite'
        data-testid='onboarding-session-boundary'
        data-restore-state={failed ? 'failed' : 'restoring'}
      >
        <h1 className='m-0 text-balance text-base font-normal leading-normal'>
          {failed
            ? 'Your conversation could not be restored.'
            : 'Restoring your conversation…'}
        </h1>
        {failed ? (
          <>
            <Button onClick={() => setRevision(current => current + 1)}>
              Try Again
            </Button>
            {isSignedIn ? (
              <Button
                variant='secondary'
                disabled={actionPending}
                onClick={() => {
                  void runAction('logout');
                }}
              >
                Log Out
              </Button>
            ) : null}
            {actionError ? <p role='alert'>{actionError}</p> : null}
          </>
        ) : null}
      </div>
    );
  }
  const allowHandoff = loaded.allowHandoff;
  return (
    <OnboardingShell
      {...props}
      key={`${identity}:${revision}:${loaded.snapshot.conversationId ?? 'new'}`}
      isSignedIn={isSignedIn}
      intentId={allowHandoff ? props.intentId : undefined}
      starterHandoff={allowHandoff ? props.starterHandoff : null}
      entryProfile={allowHandoff ? props.entryProfile : null}
      initialMessages={loaded.snapshot.messages}
      conversationId={loaded.snapshot.conversationId}
      resumeOwnedConversation={loaded.snapshot.owned}
      onRestart={() => {
        void runAction('restart');
      }}
      onLogout={() => {
        void runAction('logout');
      }}
      onBusyChange={setChatBusy}
      controlsDisabled={chatBusy}
      actionPending={actionPending}
      actionError={actionError}
    />
  );
}
