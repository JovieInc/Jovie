'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle, CheckCircle2, CreditCard, Unlink } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { SettingsActionRow } from '@/components/molecules/settings/SettingsActionRow';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';

interface StripeConnectStatus {
  connected: boolean;
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
  email: string | null;
}

async function fetchJson(
  url: string,
  options?: RequestInit
): Promise<
  { ok: true; data: Record<string, unknown> } | { ok: false; error: string }
> {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error || 'Request failed' };
  return { ok: true, data };
}

export function SettingsPaymentsSection() {
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renderPanel = (children: ReactNode, footer?: ReactNode) => (
    <SettingsPanel>
      <div className='px-4 py-4 sm:px-5'>{children}</div>
      {footer ? (
        <div className='border-t border-subtle px-4 py-3.5 sm:px-5'>
          {footer}
        </div>
      ) : null}
    </SettingsPanel>
  );

  // Fetch status on mount
  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await fetchJson('/api/stripe-connect/status');
      if (!result.ok) {
        setError(result.error || 'Failed to load payment status');
        return;
      }
      setStatus(result.data as unknown as StripeConnectStatus);
    } catch {
      setError('Failed to load payment status');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on first render
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async () => {
    setIsActionLoading(true);
    setError(null);
    try {
      const result = await fetchJson('/api/stripe-connect/onboard', {
        method: 'POST',
      });
      if (!result.ok) {
        setError(result.error || 'Failed to start onboarding');
        return;
      }
      if (typeof result.data.url === 'string') {
        globalThis.location.href = result.data.url;
      } else {
        setError('Failed to start onboarding');
      }
    } catch {
      setError('Failed to start Stripe onboarding');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setIsActionLoading(true);
    setError(null);
    try {
      const result = await fetchJson('/api/stripe-connect/disconnect', {
        method: 'POST',
      });
      if (!result.ok) {
        setError(result.error || 'Failed to disconnect');
        return;
      }
      await fetchStatus();
    } catch {
      setError('Failed to disconnect Stripe');
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    return renderPanel(
      <SettingsActionRow
        icon={<CreditCard className='h-4 w-4' aria-hidden />}
        title='Loading payments'
        description='Checking your Stripe connection and payout status.'
      />
    );
  }

  // Error state
  if (error && !status) {
    return renderPanel(
      <SettingsActionRow
        icon={<AlertTriangle className='h-4 w-4' aria-hidden />}
        title='Unable to load payments'
        description={error}
        action={
          <Button variant='secondary' size='sm' onClick={() => fetchStatus()}>
            Try again
          </Button>
        }
      />
    );
  }

  // Not connected
  if (!status?.connected) {
    return renderPanel(
      <SettingsActionRow
        icon={<CreditCard className='h-4 w-4' aria-hidden />}
        title='Stripe not connected'
        description='Connect Stripe to receive fan payments directly through Jovie. Stripe handles payment processing, payouts, and tax reporting.'
        action={
          <Button
            onClick={handleConnect}
            loading={isActionLoading || undefined}
            variant='primary'
            size='sm'
          >
            Connect Stripe
          </Button>
        }
      />,
      error ? (
        <p className='text-app leading-[18px] text-destructive'>{error}</p>
      ) : undefined
    );
  }

  // Connected but onboarding incomplete
  if (!status.onboardingComplete) {
    return renderPanel(
      <SettingsActionRow
        icon={<AlertTriangle className='h-4 w-4' aria-hidden />}
        title='Finish Stripe setup'
        description={
          status.email
            ? `Connected as ${status.email}. Finish onboarding to enable payouts and start receiving payments.`
            : 'Your Stripe account is connected, but onboarding is not complete yet. Finish setup to enable payouts.'
        }
        action={
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              onClick={handleConnect}
              loading={isActionLoading || undefined}
              variant='primary'
              size='sm'
            >
              Complete setup
            </Button>
            <Button
              onClick={handleDisconnect}
              loading={isActionLoading || undefined}
              variant='ghost'
              size='sm'
            >
              <Unlink className='mr-1 h-3.5 w-3.5' />
              Disconnect
            </Button>
          </div>
        }
      />,
      error ? (
        <p className='text-app leading-[18px] text-destructive'>{error}</p>
      ) : undefined
    );
  }

  // Connected and active
  return renderPanel(
    <SettingsActionRow
      icon={<CheckCircle2 className='h-4 w-4' aria-hidden />}
      title='Stripe connected'
      description={(() => {
        const payoutStatus = status.payoutsEnabled
          ? 'Payouts are enabled and you are ready to receive payments.'
          : 'Account connected. Stripe is still reviewing payouts.';
        return status.email
          ? `${payoutStatus} Payout email: ${status.email}.`
          : payoutStatus;
      })()}
      action={
        <Button
          onClick={handleDisconnect}
          loading={isActionLoading || undefined}
          variant='ghost'
          size='sm'
        >
          <Unlink className='mr-1 h-3.5 w-3.5' />
          Disconnect
        </Button>
      }
    />,
    error ? (
      <p className='text-app leading-[18px] text-destructive'>{error}</p>
    ) : undefined
  );
}
