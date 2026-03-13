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
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
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
      <ContentSurfaceCard className='overflow-hidden'>
        <div className='space-y-3 px-4 py-3'>
          <ContentSurfaceCard className='bg-(--linear-bg-surface-0) p-3.5'>
            <LoadingSkeleton height='h-10' />
          </ContentSurfaceCard>
          <ContentSurfaceCard className='bg-(--linear-bg-surface-0) p-3.5'>
            <LoadingSkeleton height='h-10' />
          </ContentSurfaceCard>
        </div>
      </ContentSurfaceCard>
    );
  }

  if (sessionsError) {
    return (
      <ContentSurfaceCard className='overflow-hidden'>
        <div className='px-4 py-3'>
          <ContentSurfaceCard className='bg-(--linear-bg-surface-0) p-3.5'>
            <p className='text-[13px] text-destructive'>{sessionsError}</p>
          </ContentSurfaceCard>
        </div>
      </ContentSurfaceCard>
    );
  }

  if (sessions.length === 0) {
    return (
      <ContentSurfaceCard className='overflow-hidden'>
        <div className='px-4 py-3'>
          <ContentSurfaceCard className='bg-(--linear-bg-surface-0) p-3.5'>
            <p className='text-[13px] text-(--linear-text-secondary)'>
              No other active sessions.
            </p>
          </ContentSurfaceCard>
        </div>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard className='overflow-hidden'>
      <div className='space-y-3 px-4 py-3'>
        {sessions.map(session => {
          const isCurrent = session.id === activeSessionId;
          const activity = session.latestActivity;

          return (
            <ContentSurfaceCard
              key={session.id}
              className='flex items-center justify-between gap-3 bg-(--linear-bg-surface-0) p-3.5'
            >
              <div className='min-w-0'>
                <p className='flex items-center gap-2 text-[13px] text-(--linear-text-primary)'>
                  {isCurrent
                    ? 'This device'
                    : activity?.browserName || 'Unknown device'}
                  {isCurrent ? (
                    <span className='text-[11px] text-(--linear-text-secondary)'>
                      Current session
                    </span>
                  ) : null}
                </p>
                <p className='mt-0.5 text-[11px] text-(--linear-text-secondary)'>
                  Last active {formatRelativeDate(session.lastActiveAt)}
                  {activity?.city && activity?.country
                    ? ` · ${activity.city}, ${activity.country}`
                    : ''}
                </p>
              </div>

              {!isCurrent ? (
                <Button
                  variant='destructive'
                  size='sm'
                  disabled={endingSessionId === session.id}
                  onClick={() => setSessionToEnd(session)}
                  className='shrink-0'
                >
                  {endingSessionId === session.id ? 'Ending…' : 'End session'}
                </Button>
              ) : null}
            </ContentSurfaceCard>
          );
        })}
      </div>

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
    </ContentSurfaceCard>
  );
}
