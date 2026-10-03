'use client';

/**
 * SessionManagementCard Component
 *
 * Lists the signed-in user's active Better Auth sessions and lets them end
 * an individual session, or every other session at once ("sign out
 * everywhere" — JOV-6592).
 */

import { Badge, Button, ConfirmDialog } from '@jovie/ui';
import { useEffect, useState } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { APP_ROUTES } from '@/constants/routes';
import { signOut } from '@/hooks/useJovieAuth';
import { authClient } from '@/lib/auth/client';
import { captureError } from '@/lib/error-tracking';
import { useNotifications } from '@/lib/hooks/useNotifications';

import type { BetterAuthSessionResource } from './types';
import {
  extractErrorMessage,
  formatRelativeDate,
  formatSessionDeviceName,
} from './utils';

export interface SessionManagementCardProps {
  readonly activeSessionId: string | null | undefined;
}

export function SessionManagementCard({
  activeSessionId,
}: SessionManagementCardProps) {
  const notifications = useNotifications();
  const [sessions, setSessions] = useState<BetterAuthSessionResource[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [endingAllOthers, setEndingAllOthers] = useState(false);
  const [sessionToEnd, setSessionToEnd] =
    useState<BetterAuthSessionResource | null>(null);
  const [confirmEndAllOthers, setConfirmEndAllOthers] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setSessionsLoading(true);
      setSessionsError(null);
      setRequiresSignIn(false);

      try {
        const { data, error } = await authClient.listSessions();
        if (error) throw error;
        if (!Array.isArray(data))
          throw new Error('Invalid session list response');
        if (!cancelled) {
          setSessions(data);
        }
      } catch (error) {
        if (!cancelled) {
          const code =
            error && typeof error === 'object' && 'code' in error
              ? error.code
              : null;
          const needsSignIn =
            code === 'SESSION_NOT_FRESH' || code === 'UNAUTHORIZED';
          setRequiresSignIn(needsSignIn);
          setSessionsError(
            needsSignIn
              ? 'Sign out of this device, then sign in again to manage active sessions.'
              : 'Unable to load active sessions right now.'
          );
          void captureError('Failed to load sessions', error, {
            source: 'SessionManagementCard',
          });
        }
      } finally {
        if (!cancelled) {
          setSessionsLoading(false);
        }
      }
    }

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const handleEndSession = async (session: BetterAuthSessionResource) => {
    setEndingSessionId(session.id);
    try {
      const { error } = await authClient.revokeSession({
        token: session.token,
      });
      if (error) throw error;
      setSessions(prev => prev.filter(item => item.id !== session.id));
      notifications.success('Session ended');
    } catch (error) {
      const message = extractErrorMessage(error);
      notifications.error(message);
    } finally {
      setEndingSessionId(null);
    }
  };

  const handleEndAllOtherSessions = async () => {
    setEndingAllOthers(true);
    try {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw error;
      setSessions(prev => prev.filter(item => item.id === activeSessionId));
      notifications.success('Signed out of all other sessions');
    } catch (error) {
      const message = extractErrorMessage(error);
      notifications.error(message);
    } finally {
      setEndingAllOthers(false);
    }
  };

  const otherSessionCount = sessions.filter(
    session => session.id !== activeSessionId
  ).length;

  if (sessionsLoading) {
    return (
      <div className='divide-y divide-subtle/60 overflow-hidden'>
        <div className='px-4 py-3 sm:px-5'>
          <LoadingSkeleton height='h-10' />
        </div>
        <div className='px-4 py-3 sm:px-5'>
          <LoadingSkeleton height='h-10' />
        </div>
      </div>
    );
  }

  if (sessionsError) {
    return (
      <div className='overflow-hidden'>
        <div
          role='alert'
          className='flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5'
        >
          <p className='text-app text-secondary-token'>{sessionsError}</p>
          {requiresSignIn ? (
            <Button
              variant='secondary'
              size='sm'
              disabled={signingIn}
              onClick={async () => {
                setSigningIn(true);
                try {
                  await signOut({
                    redirectUrl: `${APP_ROUTES.SIGNIN}?redirect_url=${encodeURIComponent(APP_ROUTES.SETTINGS_ACCOUNT)}`,
                  });
                } finally {
                  setSigningIn(false);
                }
              }}
            >
              Sign In Again
            </Button>
          ) : (
            <Button
              variant='secondary'
              size='sm'
              onClick={() => setRetryCount(count => count + 1)}
            >
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className='overflow-hidden'>
        <div className='px-4 py-3 sm:px-5'>
          <p className='text-app text-secondary-token'>No active sessions.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {otherSessionCount > 0 ? (
        <div className='flex justify-end'>
          <Button
            variant='ghost'
            size='sm'
            destructive
            disabled={endingAllOthers}
            onClick={() => setConfirmEndAllOthers(true)}
          >
            {endingAllOthers ? 'Signing out…' : 'Sign out other sessions'}
          </Button>
        </div>
      ) : null}

      <div className='divide-y divide-subtle/60 overflow-hidden'>
        {sessions.map(session => {
          const isCurrent = session.id === activeSessionId;

          return (
            <div
              key={session.id}
              className='flex items-start justify-between gap-3 px-4 py-3 sm:px-5'
            >
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-1.5'>
                  <p className='text-app font-caption text-primary-token'>
                    {isCurrent
                      ? 'This device'
                      : formatSessionDeviceName(session.userAgent)}
                  </p>
                  {isCurrent ? (
                    <Badge variant='secondary' size='sm'>
                      Current Session
                    </Badge>
                  ) : null}
                </div>
                <p className='mt-0.5 text-2xs text-secondary-token'>
                  Last active {formatRelativeDate(session.updatedAt)}
                </p>
              </div>

              {isCurrent ? null : (
                <Button
                  variant='ghost'
                  size='sm'
                  destructive
                  disabled={endingSessionId === session.id}
                  onClick={() => setSessionToEnd(session)}
                  className='shrink-0'
                >
                  {endingSessionId === session.id ? 'Ending…' : 'End session'}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={Boolean(sessionToEnd)}
        onOpenChange={open => {
          if (!open) setSessionToEnd(null);
        }}
        title='End session?'
        description="This will sign out the device. If you don't recognise this session, consider changing your password too."
        confirmLabel='End session'
        variant='destructive'
        onConfirm={async () => {
          if (sessionToEnd) await handleEndSession(sessionToEnd);
        }}
      />

      <ConfirmDialog
        open={confirmEndAllOthers}
        onOpenChange={setConfirmEndAllOthers}
        title='Sign out other sessions?'
        description='This signs out every device except this one. Anyone else signed in on your account will need to sign in again.'
        confirmLabel='Sign out other sessions'
        variant='destructive'
        onConfirm={handleEndAllOtherSessions}
      />
    </>
  );
}
