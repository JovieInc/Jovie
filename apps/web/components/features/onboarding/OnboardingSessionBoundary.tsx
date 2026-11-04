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
  // Read by the restore effect only to skip a server-seeded first load, so
  // the effect depends on identity and revision alone.
  const loadedRef = useRef(loaded);
  useLayoutEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);
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
    const seeded = loadedRef.current;
    if (seeded?.identity === identity && seeded.revision === revision) return;
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
  }, [identity, revision]);

  const runAction = async (action: 'restart' | 'logout') => {
    if (actionPending || chatBusy || !identity) return;
    const owner = identity;
    const postAction = (conversationId: string | null) =>
      fetch('/api/onboarding/conversation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          identityId: userId,
          conversationId,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    setActionPending(true);
    setActionError(null);
    try {
      const response = await postAction(
        loaded?.snapshot.conversationId ?? null
      );
      // JOV-10170: the boundary's snapshot conversation id is frozen at page
      // load. A conversation the chat created after that (a fresh visitor's
      // first message mints one server-side) made the restart 409 instead of
      // resetting, so Start Over only worked after a manual reload plus a
      // second click. Refresh the snapshot once and retry with the live id.
      let actionResponse = response;
      if (action === 'restart' && response.status === 409) {
        const refreshed = await fetch('/api/onboarding/conversation', {
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        });
        if (refreshed.ok) {
          const fresh: Snapshot = await refreshed.json();
          if ((fresh.identityId ?? 'anonymous') !== identity)
            throw new Error('action failed');
          actionResponse = await postAction(fresh.conversationId ?? null);
        }
      }
      if (!actionResponse.ok) throw new Error('action failed');
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
    // Sign-up inside this tab (anonymous -> account): keep the conversation
    // the visitor is looking at, frozen, while the linked copy loads. It is
    // the same person's in-tab history, so nothing new is exposed; unmounting
    // it flashed a blank "Restoring your conversation…" screen right after
    // the code was entered (2026-10-31 golden-path walk). Account-to-account
    // switches still hide history immediately.
    if (
      !failed &&
      identity &&
      identity !== 'anonymous' &&
      loaded?.identity === 'anonymous' &&
      loaded.revision === revision
    ) {
      return (
        <OnboardingShell
          {...props}
          key={`anonymous:${revision}:${loaded.snapshot.conversationId ?? 'new'}`}
          isSignedIn={false}
          intentId={loaded.allowHandoff ? props.intentId : undefined}
          starterHandoff={loaded.allowHandoff ? props.starterHandoff : null}
          entryProfile={loaded.allowHandoff ? props.entryProfile : null}
          initialMessages={loaded.snapshot.messages}
          conversationId={loaded.snapshot.conversationId}
          resumeOwnedConversation={loaded.snapshot.owned}
          onBusyChange={setChatBusy}
          controlsDisabled
          actionPending
          actionError={null}
        />
      );
    }
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
