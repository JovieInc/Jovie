'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle, CheckCircle2, CreditCard, Unlink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DashboardCard } from '@/components/dashboard/atoms/DashboardCard';

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
      <DashboardCard variant='settings' padding='none'>
        <div className='px-4 py-3'>
          <p className='text-[13px] text-secondary-token'>
            Loading payment settings...
          </p>
        </div>
      </DashboardCard>
    );
  }

  // Error state
  if (error && !status) {
    return (
      <DashboardCard variant='settings' padding='none'>
        <div className='px-4 py-3'>
          <p className='text-[13px] text-red-500'>{error}</p>
        </div>
      </DashboardCard>
    );
  }

  // Not connected
  if (!status?.connected) {
    return (
      <DashboardCard variant='settings' padding='none'>
        <div className='px-4 py-3 space-y-3'>
          <div className='flex items-start gap-3'>
            <CreditCard className='h-5 w-5 text-secondary-token mt-0.5 shrink-0' />
            <div className='flex-1'>
              <p className='text-[13px] font-[510] text-primary-token'>
                Connect with Stripe
              </p>
              <p className='text-[13px] text-secondary-token mt-1'>
                Set up Stripe Connect to receive payments directly from fans.
                Stripe handles all payment processing, payouts, and tax
                reporting.
              </p>
            </div>
          </div>
          {error && <p className='text-[13px] text-red-500'>{error}</p>}
          <Button
            onClick={handleConnect}
            loading={isActionLoading}
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
      <DashboardCard variant='settings' padding='none'>
        <div className='px-4 py-3 space-y-3'>
          <div className='flex items-start gap-3'>
            <AlertTriangle className='h-5 w-5 text-amber-500 mt-0.5 shrink-0' />
            <div className='flex-1'>
              <p className='text-[13px] font-[510] text-primary-token'>
                Stripe Setup Incomplete
              </p>
              <p className='text-[13px] text-secondary-token mt-1'>
                Your Stripe account is connected but onboarding is not complete.
                Finish setup to start receiving payments.
              </p>
            </div>
          </div>
          {error && <p className='text-[13px] text-red-500'>{error}</p>}
          <div className='flex gap-2'>
            <Button
              onClick={handleConnect}
              loading={isActionLoading}
              variant='primary'
              size='sm'
            >
              Complete Stripe Setup
            </Button>
            <Button
              onClick={handleDisconnect}
              loading={isActionLoading}
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
    <DashboardCard variant='settings' padding='none'>
      <div className='px-4 py-3 space-y-3'>
        <div className='flex items-start gap-3'>
          <CheckCircle2 className='h-5 w-5 text-green-500 mt-0.5 shrink-0' />
          <div className='flex-1'>
            <p className='text-[13px] font-[510] text-primary-token'>
              Stripe Connected
            </p>
            <p className='text-[13px] text-secondary-token mt-1'>
              {status.payoutsEnabled
                ? 'Payouts are enabled. You are ready to receive payments.'
                : 'Account connected. Payouts are being reviewed by Stripe.'}
            </p>
            {status.email && (
              <p className='text-[13px] text-secondary-token mt-1'>
                Payout email: {status.email}
              </p>
            )}
          </div>
        </div>
        {error && <p className='text-[13px] text-red-500'>{error}</p>}
        <Button
          onClick={handleDisconnect}
          loading={isActionLoading}
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
