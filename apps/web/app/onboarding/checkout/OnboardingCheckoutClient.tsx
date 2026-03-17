'use client';

import { Button } from '@jovie/ui';
import { BadgeCheck, BarChart3, Eye, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/molecules/Avatar/Avatar';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import { clearPlanIntent, type PlanIntentTier } from '@/lib/auth/plan-intent';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

interface OnboardingCheckoutClientProps {
  readonly plan: PlanIntentTier;
  readonly monthlyPriceId: string;
  readonly annualPriceId: string | null;
  readonly monthlyAmount: number;
  readonly annualAmount: number | null;
  readonly displayName: string;
  readonly username: string;
  readonly avatarUrl: string | null;
  readonly spotifyFollowers: number | null;
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function getAnnualSavingsPercent(
  monthlyAmount: number,
  annualAmount: number
): number {
  const yearlyAtMonthly = monthlyAmount * 12;
  return Math.round(((yearlyAtMonthly - annualAmount) / yearlyAtMonthly) * 100);
}

const PRO_HIGHLIGHTS = [
  {
    icon: Eye,
    label: 'Remove Jovie branding',
    detail: 'Clean, professional profile',
  },
  {
    icon: BarChart3,
    label: '90-day analytics',
    detail: 'Geographic insights & advanced data',
  },
  {
    icon: BadgeCheck,
    label: 'Verified badge',
    detail: 'Build trust with your audience',
  },
] as const;

export function OnboardingCheckoutClient({
  plan,
  monthlyPriceId,
  annualPriceId,
  monthlyAmount,
  annualAmount,
  displayName,
  username,
  avatarUrl,
  spotifyFollowers,
}: OnboardingCheckoutClientProps) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBranding, setShowBranding] = useState(true);

  const planMarketing =
    ENTITLEMENT_REGISTRY[plan]?.marketing ??
    ENTITLEMENT_REGISTRY.founding.marketing;

  const hasAnnual = annualPriceId && annualAmount;
  const savingsPercent = hasAnnual
    ? getAnnualSavingsPercent(monthlyAmount, annualAmount)
    : 0;

  const currentPriceId =
    isAnnual && annualPriceId ? annualPriceId : monthlyPriceId;
  const currentAmount = isAnnual && annualAmount ? annualAmount : monthlyAmount;
  const interval = isAnnual ? 'year' : 'month';

  useEffect(() => {
    track('onboarding_checkout_shown', {
      plan,
      has_spotify: !!spotifyFollowers,
      has_annual: !!hasAnnual,
    });
  }, [plan, spotifyFollowers, hasAnnual]);

  const handleCheckout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    track('onboarding_checkout_initiated', {
      plan,
      price_id: currentPriceId,
      interval,
    });

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: currentPriceId }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? 'Checkout failed. Please try again.');
      }

      const data = (await response.json()) as { url?: string };
      if (data.url) {
        clearPlanIntent();
        globalThis.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned.');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Try again.'
      );
      setIsLoading(false);
    }
  }, [plan, currentPriceId, interval]);

  const handleSkip = useCallback(() => {
    track('onboarding_checkout_skipped', { plan });
    clearPlanIntent();
    globalThis.location.href = APP_ROUTES.DASHBOARD;
  }, [plan]);

  return (
    <div className='flex flex-col items-center justify-center'>
      <div className={`w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
        <div className={FORM_LAYOUT.headerSection}>
          <h1 className={FORM_LAYOUT.title}>
            Upgrade to {planMarketing.displayName}
          </h1>
          <p className={FORM_LAYOUT.hint}>
            Your profile is live. See what {planMarketing.displayName} unlocks.
          </p>
        </div>

        {/* Value preview: profile card with branding toggle */}
        <ContentSurfaceCard className='mb-6 p-5'>
          <div className='flex flex-col items-center gap-4'>
            <Avatar
              src={avatarUrl}
              alt={displayName || username}
              name={displayName || username}
              size='lg'
            />

            <div className='text-center'>
              <p className='text-[15px] font-[590] text-primary-token'>
                {displayName || username}
              </p>
              <p className='text-[12px] text-tertiary-token'>@{username}</p>
            </div>

            {/* Branding toggle */}
            <div className='w-full'>
              <button
                type='button'
                onClick={() => setShowBranding(!showBranding)}
                className='group flex w-full items-center justify-between rounded-lg border border-subtle px-3 py-2 transition-colors hover:bg-surface-1'
              >
                <span className='text-[13px] text-secondary-token'>
                  Jovie branding
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-all ${
                    showBranding
                      ? 'bg-surface-2 text-tertiary-token'
                      : 'bg-(--linear-accent)/10 text-(--linear-accent)'
                  }`}
                >
                  {showBranding ? 'Visible' : 'Hidden with Pro'}
                </span>
              </button>

              {/* Simulated branding badge */}
              <div
                className={`mt-2 flex justify-center transition-all duration-300 ${
                  showBranding
                    ? 'opacity-100 max-h-8'
                    : 'opacity-0 max-h-0 overflow-hidden'
                }`}
              >
                <span className='rounded-full bg-surface-2 px-3 py-1 text-[10px] font-medium text-tertiary-token'>
                  Made with Jovie
                </span>
              </div>
            </div>
          </div>
        </ContentSurfaceCard>

        {/* Spotify personalization */}
        {spotifyFollowers && spotifyFollowers > 0 ? (
          <div className='mb-4 flex items-start gap-2.5 rounded-lg border border-subtle bg-surface-1 px-4 py-3'>
            <Sparkles className='mt-0.5 h-4 w-4 shrink-0 text-(--linear-accent)' />
            <p className='text-[13px] text-secondary-token'>
              You have{' '}
              <span className='font-medium text-primary-token'>
                {spotifyFollowers.toLocaleString()} Spotify followers
              </span>
              . {planMarketing.displayName} analytics shows exactly where
              they&apos;re listening from.
            </p>
          </div>
        ) : null}

        {/* Pro highlights */}
        <div className='mb-6 space-y-2.5'>
          {PRO_HIGHLIGHTS.map(item => (
            <div key={item.label} className='flex items-start gap-3'>
              <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-1'>
                <item.icon className='h-4 w-4 text-(--linear-accent)' />
              </div>
              <div>
                <p className='text-[13px] font-medium text-primary-token'>
                  {item.label}
                </p>
                <p className='text-[12px] text-tertiary-token'>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Annual toggle */}
        {hasAnnual ? (
          <div className='mb-4 flex items-center justify-center gap-3'>
            <button
              type='button'
              onClick={() => setIsAnnual(false)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                !isAnnual
                  ? 'bg-surface-1 text-primary-token'
                  : 'text-tertiary-token hover:text-secondary-token'
              }`}
            >
              Monthly
            </button>
            <button
              type='button'
              onClick={() => setIsAnnual(true)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                isAnnual
                  ? 'bg-surface-1 text-primary-token'
                  : 'text-tertiary-token hover:text-secondary-token'
              }`}
            >
              Annual{' '}
              <span className='text-(--linear-accent)'>−{savingsPercent}%</span>
            </button>
          </div>
        ) : null}

        {/* Price display */}
        <div className='mb-6 text-center'>
          <span className='text-3xl font-semibold tracking-tight text-primary-token'>
            {formatPrice(currentAmount)}
          </span>
          <span className='text-[14px] text-tertiary-token'>
            /{interval === 'year' ? 'yr' : 'mo'}
          </span>
        </div>

        {/* Error message */}
        {error ? (
          <div
            className='mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive'
            role='alert'
          >
            {error}
          </div>
        ) : null}

        {/* CTA */}
        <Button
          onClick={handleCheckout}
          disabled={isLoading}
          variant='accent'
          size='xl'
          className='w-full'
          aria-busy={isLoading}
        >
          {isLoading
            ? 'Redirecting to checkout...'
            : `Upgrade to ${planMarketing.displayName}`}
        </Button>

        {/* Skip */}
        <button
          type='button'
          onClick={handleSkip}
          disabled={isLoading}
          className='mt-4 w-full text-center text-[13px] text-tertiary-token hover:text-secondary-token transition-colors disabled:opacity-50'
        >
          Continue with Free
        </button>
      </div>
    </div>
  );
}
