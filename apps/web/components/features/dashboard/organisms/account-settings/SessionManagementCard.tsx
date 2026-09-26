'use client';

/**
 * SessionManagementCard Component
 *
 * Displays the current user's active Better Auth sessions and lets them end
 * an individual session or sign out of every other device.
 */

import { Badge, Button, ConfirmDialog } from '@jovie/ui';
import { useEffect, useState } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { captureError } from '@/lib/error-tracking';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { fetchWithTimeout } from '@/lib/queries';

import { extractErrorMessage, formatRelativeDate } from './utils';

interface AccountSessionDTO {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly lastActiveAt: string;
  readonly isCurrent: boolean;
}

const END_SESSION_BUTTON_CLASS =
  'h-7 shrink-0 rounded-lg border border-transparent bg-transparent px-2.5 text-2xs font-caption text-secondary-token hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive';

export function SessionManagementCard() {
  const notifications = useNotifications();
  const [sessions, setSessions] = useState<AccountSessionDTO[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [sessionToEnd, setSessionToEnd] = useState<AccountSessionDTO | null>(
    null
  );
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const [confirmSignOutOthers, setConfirmSignOutOthers] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setSessionsLoading(true);
      setSessionsError(null);

      try {
        const { sessions: rows } = await fetchWithTimeout<{
          sessions: AccountSessionDTO[];
        }>('/api/account/sessions');
        if (!cancelled) {
          setSessions(rows);
        }
      } catch (error) {
        if (!cancelled) {
          setSessionsError('Unable to load active sessions right now.');
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
  }, []);

  const handleEndSession = async (session: AccountSessionDTO) => {
    setEndingSessionId(session.id);
    try {
      await fetchWithTimeout(
        `/api/account/sessions/${encodeURIComponent(session.id)}`,
        { method: 'DELETE' }
      );
      setSessions(prev => prev.filter(item => item.id !== session.id));
      notifications.success('Session ended');
    } catch (error) {
      notifications.error(extractErrorMessage(error));
    } finally {
      setEndingSessionId(null);
    }
  };

  const handleSignOutOthers = async () => {
    setSigningOutOthers(true);
    try {
      await fetchWithTimeout('/api/account/sessions/revoke-others', {
        method: 'POST',
      });
      setSessions(prev => prev.filter(item => item.isCurrent));
      notifications.success('Signed out of all other sessions');
    } catch (error) {
      notifications.error(extractErrorMessage(error));
    } finally {
      setSigningOutOthers(false);
    }
  };

  if (sessionsLoading) {
    return (
      <div
        className='space-y-3 px-4 py-3 sm:px-5'
        data-testid='sessions-loading'
      >
        <LoadingSkeleton height='h-10' />
        <LoadingSkeleton height='h-10' />
      </div>
    );
  }

  if (sessionsError) {
    return (
      <div className='px-4 py-3 sm:px-5'>
        <p className='text-app text-destructive'>{sessionsError}</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className='px-4 py-3 sm:px-5'>
        <p className='text-app text-secondary-token'>No active sessions.</p>
      </div>
    );
  }

  const otherSessionCount = sessions.filter(
    session => !session.isCurrent
  ).length;

  return (
    <>
      <div className='divide-y divide-subtle/60' data-testid='sessions-list'>
        {sessions.map(session => (
          <div
            key={session.id}
            className='flex items-start justify-between gap-3 px-4 py-3 sm:px-5'
          >
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-1.5'>
                <p className='text-app font-caption text-primary-token'>
                  {session.isCurrent ? 'This device' : 'Other device'}
                </p>
                {session.isCurrent ? (
                  <Badge variant='secondary' size='sm'>
                    Current Session
                  </Badge>
                ) : null}
              </div>
              <p className='mt-0.5 text-2xs text-secondary-token'>
                Last active {formatRelativeDate(new Date(session.lastActiveAt))}
                {session.ipAddress ? ` · ${session.ipAddress}` : ''}
              </p>
            </div>

            {session.isCurrent ? null : (
              <Button
                variant='ghost'
                size='sm'
                disabled={endingSessionId === session.id}
                onClick={() => setSessionToEnd(session)}
                className={END_SESSION_BUTTON_CLASS}
              >
                {endingSessionId === session.id ? 'Ending…' : 'End session'}
              </Button>
            )}
          </div>
        ))}
        {otherSessionCount > 0 ? (
          <div className='flex justify-end px-4 py-3 sm:px-5'>
            <Button
              variant='ghost'
              size='sm'
              disabled={signingOutOthers}
              onClick={() => setConfirmSignOutOthers(true)}
              className={END_SESSION_BUTTON_CLASS}
            >
              {signingOutOthers
                ? 'Signing out…'
                : `Sign out ${otherSessionCount} other session${
                    otherSessionCount === 1 ? '' : 's'
                  }`}
            </Button>
          </div>
        ) : null}
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
        open={confirmSignOutOthers}
        onOpenChange={setConfirmSignOutOthers}
        title='Sign out other sessions?'
        description='This will sign out every device except this one.'
        confirmLabel='Sign out other sessions'
        variant='destructive'
        onConfirm={handleSignOutOthers}
      />
    </>
  );
}
