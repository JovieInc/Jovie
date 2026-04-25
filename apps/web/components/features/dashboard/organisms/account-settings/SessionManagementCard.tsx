'use client';

/**
 * SessionManagementCard Component
 *
 * Displays and manages active user sessions.
 * Allows users to view and revoke sessions on other devices.
 */

import { Badge, Button } from '@jovie/ui';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { captureError } from '@/lib/error-tracking';
import { useNotifications } from '@/lib/hooks/useNotifications';

import type { ClerkSessionResource, ClerkUserResource } from './types';
import { extractErrorMessage, formatRelativeDate } from './utils';

export interface SessionManagementCardProps {
  readonly user: ClerkUserResource;
  readonly activeSessionId: string | null | undefined;
}

export function SessionManagementCard({
  user,
  activeSessionId,
}: SessionManagementCardProps) {
  const notifications = useNotifications();
  const [sessions, setSessions] = useState<ClerkSessionResource[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [endingSessionId, setEndingSessionId] = useState<string | null>(null);
  const [sessionToEnd, setSessionToEnd] = useState<ClerkSessionResource | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setSessionsLoading(true);
      setSessionsError(null);

      try {
        const userSessions = await user.getSessions();
        if (!cancelled) {
          setSessions(userSessions ?? []);
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
  }, [user]);

  const handleEndSession = async (session: ClerkSessionResource) => {
    setEndingSessionId(session.id);
    try {
      await session.revoke();
      setSessions(prev => prev.filter(item => item.id !== session.id));
      notifications.success('Session ended');
    } catch (error) {
      const message = extractErrorMessage(error);
      notifications.error(message);
    } finally {
      setEndingSessionId(null);
    }
  };

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
          <p className='text-app text-secondary-token'>
            No other active sessions.
          </p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <>
      <DashboardCard
        variant='settings'
        padding='none'
        className='divide-y divide-subtle/60 overflow-hidden'
      >
        {sessions.map(session => {
          const isCurrent = session.id === activeSessionId;
          const activity = session.latestActivity;

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
                      : activity?.browserName || 'Unknown device'}
                  </p>
                  {isCurrent ? (
                    <Badge variant='secondary' size='sm'>
                      Current Session
                    </Badge>
                  ) : null}
                </div>
                <p className='mt-0.5 text-2xs text-secondary-token'>
                  Last active {formatRelativeDate(session.lastActiveAt)}
                  {activity?.city && activity?.country
                    ? ` · ${activity.city}, ${activity.country}`
                    : ''}
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
        description='This will sign out the device. If you don&#39;t recognise this session, consider changing your password too.'
        confirmLabel='End session'
        variant='destructive'
        onConfirm={async () => {
          if (sessionToEnd) await handleEndSession(sessionToEnd);
        }}
      />
    </>
  );
}
