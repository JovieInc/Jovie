'use client';

/**
 * SessionManagementCard Component
 *
 * Displays and manages active user sessions.
 * Allows users to view and revoke sessions on other devices.
 */

import { Button } from '@jovie/ui';

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { useNotifications } from '@/lib/hooks/useNotifications';

import { DashboardCard } from '../../atoms/DashboardCard';
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
          console.error('Failed to load sessions:', error);
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
      <DashboardCard variant='settings' padding='none'>
        <div className='px-5 py-4 space-y-3'>
          <LoadingSkeleton height='h-10' />
          <LoadingSkeleton height='h-10' />
        </div>
      </DashboardCard>
    );
  }

  if (sessionsError) {
    return (
      <DashboardCard variant='settings' padding='none'>
        <div className='px-5 py-4 text-sm text-destructive'>
          {sessionsError}
        </div>
      </DashboardCard>
    );
  }

  if (sessions.length === 0) {
    return null;
  }

  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='divide-y divide-subtle'
    >
      {sessions.map(session => {
        const isCurrent = session.id === activeSessionId;
        const activity = session.latestActivity;

        return (
          <div
            key={session.id}
            className='flex items-center justify-between px-5 py-4'
          >
            <div>
              <p className='text-sm text-primary-token flex items-center gap-2'>
                {isCurrent
                  ? 'This device'
                  : activity?.browserName || 'Unknown device'}
                {isCurrent && (
                  <span className='text-xs text-secondary-token'>
                    Current session
                  </span>
                )}
              </p>
              <p className='text-xs text-secondary-token mt-0.5'>
                Last active {formatRelativeDate(session.lastActiveAt)}
                {activity?.city && activity?.country
                  ? ` · ${activity.city}, ${activity.country}`
                  : ''}
              </p>
            </div>

            {!isCurrent && (
              <Button
                variant='ghost'
                size='sm'
                className='text-destructive hover:text-red-600 hover:bg-red-50'
                disabled={endingSessionId === session.id}
                onClick={() => setSessionToEnd(session)}
              >
                {endingSessionId === session.id ? 'Ending…' : 'End session'}
              </Button>
            )}
          </div>
        );
      })}

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
    </DashboardCard>
  );
}
