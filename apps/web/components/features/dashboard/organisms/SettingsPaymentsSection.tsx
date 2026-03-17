'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle, CheckCircle2, CreditCard, Unlink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DashboardCard } from '@/features/dashboard/atoms/DashboardCard';

interface StripeConnectStatus {
  connected: boolean;
  onboardingComplete: boolean;
  payoutsEnabled: boolean;
  email: string | null;
}

export function SettingsPaymentsSection() {
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch status on mount
  const fetchStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/stripe-connect/status');
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load payment status');
        return;
      }
      const data = await res.json();
      setStatus(data);
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
      const res = await fetch('/api/stripe-connect/onboard', {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to start onboarding');
        return;
      }
      const data = await res.json();
      if (data.url) {
        globalThis.location.href = data.url;
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
      const res = await fetch('/api/stripe-connect/disconnect', {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to disconnect');
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
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Stripe payouts'
          subtitle='Connect Stripe to receive fan payments directly through Jovie.'
          className='min-h-0 px-4 py-3'
        />
        <div className='px-4 py-3'>
          <ContentSurfaceCard className='bg-surface-0 px-4 py-3.5'>
            <p className='text-[13px] text-secondary-token'>
              Loading payment settings...
            </p>
          </ContentSurfaceCard>
        </div>
      </DashboardCard>
    );
  }

  // Error state
  if (error && !status) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Stripe payouts'
          subtitle='Connect Stripe to receive fan payments directly through Jovie.'
          className='min-h-0 px-4 py-3'
        />
        <div className='px-4 py-3'>
          <ContentSurfaceCard className='bg-surface-0 px-4 py-3.5'>
            <p className='text-[13px] text-error'>{error}</p>
          </ContentSurfaceCard>
        </div>
      </DashboardCard>
    );
  }

  // Not connected
  if (!status?.connected) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Stripe payouts'
          subtitle='Connect Stripe to receive fan payments directly through Jovie.'
          className='min-h-0 px-4 py-3'
        />
        <div className='px-4 py-3 space-y-3'>
          <ContentSurfaceCard className='bg-surface-0 p-4'>
            <div className='flex items-start gap-3'>
              <CreditCard className='mt-0.5 h-5 w-5 shrink-0 text-secondary-token' />
              <div className='flex-1'>
                <p className='text-[13px] font-[510] text-primary-token'>
                  Connect with Stripe
                </p>
                <p className='mt-1 text-[13px] text-secondary-token'>
                  Set up Stripe Connect to receive payments directly from fans.
                  Stripe handles all payment processing, payouts, and tax
                  reporting.
                </p>
              </div>
            </div>
            {error && <p className='mt-3 text-[13px] text-error'>{error}</p>}
          </ContentSurfaceCard>
          <Button
            onClick={handleConnect}
            loading={isActionLoading || undefined}
            variant='primary'
            size='sm'
            className='w-full sm:w-auto'
          >
            Connect with Stripe
          </Button>
        </div>
      </DashboardCard>
    );
  }

  // Connected but onboarding incomplete
  if (!status.onboardingComplete) {
    return (
      <DashboardCard
        variant='settings'
        padding='none'
        className='overflow-hidden'
      >
        <ContentSectionHeader
          title='Stripe payouts'
          subtitle='Finish Stripe onboarding to enable payouts and collect payments.'
          className='min-h-0 px-4 py-3'
        />
        <div className='px-4 py-3 space-y-3'>
          <ContentSurfaceCard className='bg-surface-0 p-4'>
            <div className='flex items-start gap-3'>
              <AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-warning' />
              <div className='flex-1'>
                <p className='text-[13px] font-[510] text-primary-token'>
                  Stripe setup incomplete
                </p>
                <p className='mt-1 text-[13px] text-secondary-token'>
                  Your Stripe account is connected but onboarding is not
                  complete. Finish setup to start receiving payments.
                </p>
              </div>
            </div>
            {error && <p className='mt-3 text-[13px] text-error'>{error}</p>}
          </ContentSurfaceCard>
          <div className='flex gap-2'>
            <Button
              onClick={handleConnect}
              loading={isActionLoading || undefined}
              variant='primary'
              size='sm'
            >
              Complete Stripe Setup
            </Button>
            <Button
              onClick={handleDisconnect}
              loading={isActionLoading || undefined}
              variant='ghost'
              size='sm'
            >
              <Unlink className='h-3.5 w-3.5 mr-1' />
              Disconnect
            </Button>
          </div>
        </div>
      </DashboardCard>
    );
  }

  // Connected and active
  return (
    <DashboardCard
      variant='settings'
      padding='none'
      className='overflow-hidden'
    >
      <ContentSectionHeader
        title='Stripe payouts'
        subtitle='Stripe is connected and ready to handle fan payments.'
        className='min-h-0 px-4 py-3'
      />
      <div className='px-4 py-3 space-y-3'>
        <ContentSurfaceCard className='bg-surface-0 p-4'>
          <div className='flex items-start gap-3'>
            <CheckCircle2 className='mt-0.5 h-5 w-5 shrink-0 text-success' />
            <div className='flex-1'>
              <p className='text-[13px] font-[510] text-primary-token'>
                Stripe connected
              </p>
              <p className='mt-1 text-[13px] text-secondary-token'>
                {status.payoutsEnabled
                  ? 'Payouts are enabled. You are ready to receive payments.'
                  : 'Account connected. Payouts are being reviewed by Stripe.'}
              </p>
              {status.email && (
                <p className='mt-1 text-[13px] text-secondary-token'>
                  Payout email: {status.email}
                </p>
              )}
            </div>
          </div>
          {error && <p className='mt-3 text-[13px] text-error'>{error}</p>}
        </ContentSurfaceCard>
        <Button
          onClick={handleDisconnect}
          loading={isActionLoading || undefined}
          variant='ghost'
          size='sm'
        >
          <Unlink className='h-3.5 w-3.5 mr-1' />
          Disconnect
        </Button>
      </div>
    </DashboardCard>
  );
}
