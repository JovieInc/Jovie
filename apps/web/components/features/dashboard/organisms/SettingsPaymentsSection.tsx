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
  onboardingAvailable?: boolean;
}

type StripeConnectErrorCode = 'platform_profile_incomplete' | string;

async function fetchJson(
  url: string,
  options?: RequestInit
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; code?: StripeConnectErrorCode }
> {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    return {
      ok: false,
      error: data.error || 'Request failed',
      code: typeof data.code === 'string' ? data.code : undefined,
    };
  }
  return { ok: true, data };
}

const PLATFORM_PROFILE_UNAVAILABLE_MESSAGE =
  'Payout setup is temporarily unavailable. Please try again later.';

export function SettingsPaymentsSection() {
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<StripeConnectErrorCode | null>(
    null
  );
  const [onboardingUnavailable, setOnboardingUnavailable] = useState(false);

  const isPlatformProfileUnavailable =
    onboardingUnavailable || errorCode === 'platform_profile_incomplete';

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

  const renderNotice = (message: string, tone: 'warning' | 'error') => (
    <p
      className={
        tone === 'warning'
          ? 'text-app leading-[18px] text-warning'
          : 'text-app leading-[18px] text-destructive'
      }
    >
      {message}
    </p>
  );

  // Fetch status on mount
  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setErrorCode(null);
      const result = await fetchJson('/api/stripe-connect/status');
      if (!result.ok) {
        setError(result.error || 'Failed to load payment status');
        setErrorCode(result.code ?? null);
        return;
      }
      const nextStatus = result.data as unknown as StripeConnectStatus;
      setStatus(nextStatus);
      setOnboardingUnavailable(nextStatus.onboardingAvailable === false);
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
    if (isPlatformProfileUnavailable) {
      setError(PLATFORM_PROFILE_UNAVAILABLE_MESSAGE);
      setErrorCode('platform_profile_incomplete');
      return;
    }

    setIsActionLoading(true);
    setError(null);
    setErrorCode(null);
    try {
      const result = await fetchJson('/api/stripe-connect/onboard', {
        method: 'POST',
      });
      if (!result.ok) {
        setError(result.error || 'Failed to start onboarding');
        setErrorCode(result.code ?? null);
        if (result.code === 'platform_profile_incomplete') {
          setOnboardingUnavailable(true);
        }
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
    setErrorCode(null);
    try {
      const result = await fetchJson('/api/stripe-connect/disconnect', {
        method: 'POST',
      });
      if (!result.ok) {
        setError(result.error || 'Failed to disconnect');
        setErrorCode(result.code ?? null);
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
        description='Checking your stripe connection and payout status.'
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
            Try Again
          </Button>
        }
      />
    );
  }

  // Platform profile incomplete — fail-soft unavailable state
  if (isPlatformProfileUnavailable && !status?.connected) {
    return renderPanel(
      <SettingsActionRow
        icon={<AlertTriangle className='h-4 w-4' aria-hidden />}
        title='Payout setup temporarily unavailable'
        description='Stripe payout onboarding is paused while jovie finishes platform setup. Your account is safe — try again later.'
        action={
          <Button variant='secondary' size='sm' disabled>
            Connect Stripe
          </Button>
        }
      />,
      renderNotice(error ?? PLATFORM_PROFILE_UNAVAILABLE_MESSAGE, 'warning')
    );
  }

  // Not connected
  if (!status?.connected) {
    return renderPanel(
      <SettingsActionRow
        icon={<CreditCard className='h-4 w-4' aria-hidden />}
        title='Stripe not connected'
        description='Connect stripe to receive fan payments directly through jovie. Stripe handles payment processing, payouts, and tax reporting.'
        action={
          <Button
            onClick={handleConnect}
            loading={isActionLoading || undefined}
            variant='primary'
            size='sm'
            disabled={isPlatformProfileUnavailable || undefined}
          >
            Connect Stripe
          </Button>
        }
      />,
      error
        ? renderNotice(
            error,
            isPlatformProfileUnavailable ? 'warning' : 'error'
          )
        : undefined
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
              disabled={isPlatformProfileUnavailable || undefined}
            >
              Complete Setup
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
      error
        ? renderNotice(
            error,
            isPlatformProfileUnavailable ? 'warning' : 'error'
          )
        : undefined
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
    error
      ? renderNotice(error, isPlatformProfileUnavailable ? 'warning' : 'error')
      : undefined
  );
}
