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
import { cn } from '@/lib/utils';

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

  return (
    <DashboardCard variant='settings'>
      <div className='flex items-start justify-between gap-6'>
        <div className='flex-1'>
          <h3 className='text-[14px] font-medium text-primary-token'>
            Active sessions
          </h3>
          <p className='mt-1 text-[13px] text-secondary-token max-w-lg'>
            Keep an eye on the devices signed in to your account. End sessions
            you no longer recognise.
          </p>
        </div>
      </div>

      {(() => {
        if (sessionsLoading) {
          return (
            <div className='mt-6 space-y-3'>
              <LoadingSkeleton height='h-12' />
              <LoadingSkeleton height='h-12' />
            </div>
          );
        }

        if (sessionsError) {
          return (
            <div className='mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600'>
              {sessionsError}
            </div>
          );
        }

        if (sessions.length === 0) {
          return (
            <div className='mt-6 rounded-lg border border-subtle bg-surface-0 px-4 py-6 text-center text-sm text-secondary'>
              You have no other active sessions.
            </div>
          );
        }

        return (
          <div className='mt-6 space-y-3'>
            {sessions.map(session => {
              const isCurrent = session.id === activeSessionId;
              const activity = session.latestActivity;

              return (
                <div
                  key={session.id}
                  className={cn(
                    'flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-subtle px-4 py-3 bg-surface-1',
                    isCurrent && 'border-accent'
                  )}
                >
                  <div>
                    <p className='text-sm font-semibold text-primary flex items-center gap-2'>
                      {isCurrent
                        ? 'This device'
                        : activity?.browserName || 'Unknown device'}
                      {isCurrent && (
                        <span className='inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent'>
                          Current session
                        </span>
                      )}
                    </p>
                    <p className='text-xs text-secondary mt-1'>
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
                      className='text-red-500 hover:text-red-600 hover:bg-red-50'
                      disabled={endingSessionId === session.id}
                      onClick={() => setSessionToEnd(session)}
                    >
                      {endingSessionId === session.id
                        ? 'Ending…'
                        : 'End session'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

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
