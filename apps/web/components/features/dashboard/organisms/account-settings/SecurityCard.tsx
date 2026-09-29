'use client';

/**
 * SecurityCard — Settings → Account security overview (JOV-6600):
 * score + protections, recent sign-ins, audited security events, and
 * the panic button that freezes links, revokes every session, and
 * alerts support.
 */

import { Badge, Button, ConfirmDialog } from '@jovie/ui';
import { useEffect, useState } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';
import { signOut } from '@/hooks/useJovieAuth';
import { captureError } from '@/lib/error-tracking';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { fetchWithTimeout } from '@/lib/queries';

import { formatRelativeDate, formatSessionDeviceName } from './utils';

interface SecurityOverviewResponse {
  email: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  passkeyCount: number;
  activeSessionCount: number;
  score: number;
  factors: { id: string; label: string; active: boolean }[];
  recentSessions: {
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
    lastActiveAt: string;
  }[];
  recentEvents: {
    id: string;
    type: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }[];
}

const EVENT_LABELS: Record<string, string> = {
  panic: 'Panic button used — sessions revoked and links frozen',
  links_restored: 'Links restored from a previous version',
};

function describeEvent(type: string): string {
  return EVENT_LABELS[type] ?? type.replace(/_/g, ' ');
}

function scoreTone(score: number): 'secondary' | 'warning' | 'destructive' {
  if (score >= 70) return 'secondary';
  if (score >= 40) return 'warning';
  return 'destructive';
}

export function SecurityCard() {
  const notifications = useNotifications();
  const [overview, setOverview] = useState<SecurityOverviewResponse | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmPanic, setConfirmPanic] = useState(false);
  const [panicking, setPanicking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchWithTimeout<SecurityOverviewResponse>(
          '/api/account/security/overview'
        );
        if (!cancelled) setOverview(data);
      } catch (error) {
        if (!cancelled) {
          setLoadError('Unable to load your security status right now.');
          void captureError('Failed to load security overview', error, {
            source: 'SecurityCard',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePanic = async () => {
    setPanicking(true);
    try {
      await fetchWithTimeout('/api/account/security/panic', {
        method: 'POST',
      });
      notifications.success(
        'Account secured. Every session was signed out and support has been notified.'
      );
    } catch (error) {
      void captureError('Panic request failed', error, {
        source: 'SecurityCard',
      });
    } finally {
      // Sessions were revoked server-side even if the response was lost;
      // always clear local auth state and land on the sign-in screen.
      await signOut({ redirectUrl: '/signin' });
    }
  };

  if (loading) {
    return (
      <DashboardCard variant='settings' padding='none'>
        <div className='space-y-3 px-4 py-4 sm:px-5'>
          <LoadingSkeleton height='h-10' />
          <LoadingSkeleton height='h-10' />
        </div>
      </DashboardCard>
    );
  }

  if (loadError || !overview) {
    return (
      <DashboardCard variant='settings'>
        <p className='text-app text-destructive'>{loadError}</p>
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
        <div className='flex items-center justify-between gap-3 px-4 py-3 sm:px-5'>
          <div>
            <p className='text-app font-caption text-primary-token'>
              Security score
            </p>
            <p className='mt-0.5 text-2xs text-secondary-token'>
              Passkeys are the strongest protection against phishing.
            </p>
          </div>
          <Badge variant={scoreTone(overview.score)} size='sm'>
            {overview.score}/100
          </Badge>
        </div>

        <div className='space-y-2 px-4 py-3 sm:px-5'>
          {overview.factors.map(factor => (
            <div
              key={factor.id}
              className='flex items-center justify-between gap-3'
            >
              <p className='text-app text-secondary-token'>{factor.label}</p>
              <Badge
                variant={factor.active ? 'secondary' : 'outline'}
                size='sm'
              >
                {factor.active ? 'On' : 'Off'}
              </Badge>
            </div>
          ))}
          <div className='flex items-center justify-between gap-3'>
            <p className='text-app text-secondary-token'>
              Sign-in and takeover alerts
            </p>
            <Badge variant='secondary' size='sm'>
              Always On
            </Badge>
          </div>
        </div>

        {overview.recentSessions.length > 0 ? (
          <div className='px-4 py-3 sm:px-5'>
            <p className='text-app font-caption text-primary-token'>
              Recent sign-ins
            </p>
            <ul className='mt-2 space-y-2'>
              {overview.recentSessions.slice(0, 5).map(session => (
                <li
                  key={session.id}
                  className='flex items-center justify-between gap-3'
                >
                  <p className='text-app text-secondary-token'>
                    {formatSessionDeviceName(session.userAgent)}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                  </p>
                  <p className='text-2xs text-secondary-token'>
                    {formatRelativeDate(new Date(session.lastActiveAt))}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {overview.recentEvents.length > 0 ? (
          <div className='px-4 py-3 sm:px-5'>
            <p className='text-app font-caption text-primary-token'>
              Security activity
            </p>
            <ul className='mt-2 space-y-2'>
              {overview.recentEvents.slice(0, 5).map(event => (
                <li
                  key={event.id}
                  className='flex items-center justify-between gap-3'
                >
                  <p className='text-app text-secondary-token'>
                    {describeEvent(event.type)}
                  </p>
                  <p className='text-2xs text-secondary-token'>
                    {formatRelativeDate(new Date(event.createdAt))}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className='flex items-center justify-between gap-3 px-4 py-3 sm:px-5'>
          <p className='text-2xs text-secondary-token'>
            If you suspect someone else has your account, secure it now.
          </p>
          <Button
            variant='ghost'
            size='sm'
            destructive
            disabled={panicking}
            onClick={() => setConfirmPanic(true)}
          >
            {panicking ? 'Securing…' : 'Secure my account'}
          </Button>
        </div>
      </DashboardCard>

      <ConfirmDialog
        open={confirmPanic}
        onOpenChange={setConfirmPanic}
        title='Secure your account?'
        description='This immediately signs out every device, deactivates your profile links (you can restore them from link history), and alerts Jovie support. Use this if you think someone else has access to your account.'
        confirmLabel='Secure my account'
        variant='destructive'
        onConfirm={handlePanic}
      />
    </>
  );
}
