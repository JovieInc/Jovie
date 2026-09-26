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
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
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

      try {
        const { data, error } = await authClient.listSessions();
        if (error) throw error;
        if (!cancelled) {
          setSessions(data ?? []);
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
      <DashboardCard
        variant='settings'
        padding='none'
        className='divide-y divide-subtle/60 overflow-hidden'
      >
        <div className='px-4 py-3 sm:px-5'>
          <LoadingSkeleton height='h-10' />
        </div>
        <div className='px-4 py-3 sm:px-5'>
          <LoadingSkeleton height='h-10' />
        </div>
      </DashboardCard>
    );
  }

  if (sessionsError) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <div className='px-4 py-3 sm:px-5'>
          <p className='text-app text-destructive'>{sessionsError}</p>
        </div>
      </DashboardCard>
    );
  }

  if (sessions.length === 0) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <div className='px-4 py-3 sm:px-5'>
          <p className='text-app text-secondary-token'>No active sessions.</p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <>
      {otherSessionCount > 0 ? (
        <div className='flex justify-end'>
          <Button
            variant='ghost'
            size='sm'
            disabled={endingAllOthers}
            onClick={() => setConfirmEndAllOthers(true)}
            className='h-7 rounded-lg px-2.5 text-2xs font-caption text-secondary-token hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive'
          >
            {endingAllOthers ? 'Signing out…' : 'Sign out other sessions'}
          </Button>
        </div>
      ) : null}

      <DashboardCard
        variant='settings'
        padding='none'
        className='divide-y divide-subtle/60 overflow-hidden'
      >
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
                  disabled={endingSessionId === session.id}
                  onClick={() => setSessionToEnd(session)}
                  className='h-7 shrink-0 rounded-lg border border-transparent bg-transparent px-2.5 text-2xs font-caption text-secondary-token hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive'
                >
                  {endingSessionId === session.id ? 'Ending…' : 'End session'}
                </Button>
              )}
            </div>
          );
        })}
      </DashboardCard>

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
