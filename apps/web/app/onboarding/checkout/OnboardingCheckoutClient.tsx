'use client';

import { Button } from '@jovie/ui';
import { BadgeCheck, BarChart3, Bell, Sparkles } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/molecules/Avatar/Avatar';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { track } from '@/lib/analytics';
import { AUTH_SURFACE, FORM_LAYOUT } from '@/lib/auth/constants';
import { clearPlanIntent, type PlanIntentTier } from '@/lib/auth/plan-intent';
import { getEntitlements } from '@/lib/entitlements/registry';
import { normalizeOnboardingReturnTo } from '@/lib/onboarding/return-to';
import { cn } from '@/lib/utils';

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
  readonly isDefaultUpsell: boolean;
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
    icon: Bell,
    label: 'Release notifications',
    detail: 'Notify fans the moment you drop',
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

interface ProfilePreviewCardProps {
  readonly avatarUrl: string | null;
  readonly displayName: string;
  readonly spotifyFollowers: number | null;
  readonly username: string;
}

function ProfilePreviewCard({
  avatarUrl,
  displayName,
  spotifyFollowers,
  username,
}: ProfilePreviewCardProps) {
  return (
    <>
      <ContentSurfaceCard className='mb-6 p-5'>
        <div className='flex flex-col items-center gap-4'>
          <Avatar
            src={avatarUrl}
            alt={displayName || username}
            name={displayName || username}
            size='lg'
          />

          <div className='text-center'>
            <p className='text-[15px] font-semibold text-primary-token'>
              {displayName || username}
            </p>
            <p className='text-[12px] text-tertiary-token'>@{username}</p>
          </div>

          <div className='w-full'>
            <div className='flex items-center justify-between rounded-[14px] border border-subtle bg-surface-1 px-3.5 py-2.5'>
              <span className='text-[13px] text-secondary-token'>
                Jovie branding
              </span>
              <span className='rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-tertiary-token'>
                Visible
              </span>
            </div>
            <div className='mt-2 flex justify-center'>
              <span className='rounded-full bg-surface-2 px-3 py-1 text-[10px] font-medium text-tertiary-token'>
                Made with Jovie
              </span>
            </div>
          </div>
        </div>
      </ContentSurfaceCard>

      {spotifyFollowers && spotifyFollowers > 0 ? (
        <ContentSurfaceCard className='mb-4 px-4 py-3'>
          <Sparkles className='mt-0.5 h-4 w-4 shrink-0 text-(--linear-accent)' />
          <p className='text-[13px] text-secondary-token'>
            You have{' '}
            <span className='font-medium text-primary-token'>
              {spotifyFollowers.toLocaleString()} Spotify followers
            </span>
            {'. '}
            Pro analytics shows exactly where they&apos;re listening from.
          </p>
        </ContentSurfaceCard>
      ) : null}
    </>
  );
}

interface BillingIntervalSelectorProps {
  readonly isAnnual: boolean;
  readonly savingsPercent: number;
  readonly onSelect: (isAnnual: boolean) => void;
}

function BillingIntervalSelector({
  isAnnual,
  savingsPercent,
  onSelect,
}: BillingIntervalSelectorProps) {
  return (
    <fieldset className='mb-4'>
      <legend className='sr-only'>Billing interval</legend>
      <div className='flex items-center justify-center gap-3'>
        <label
          className={cn(
            AUTH_SURFACE.pillOption,
            !isAnnual && AUTH_SURFACE.pillOptionActive,
            'cursor-pointer'
          )}
        >
          <input
            type='radio'
            name='billing-interval'
            className='sr-only'
            checked={!isAnnual}
            onChange={() => onSelect(false)}
          />{' '}
          Monthly
        </label>
        <label
          className={cn(
            AUTH_SURFACE.pillOption,
            isAnnual && AUTH_SURFACE.pillOptionActive,
            'cursor-pointer'
          )}
        >
          <input
            type='radio'
            name='billing-interval'
            className='sr-only'
            checked={isAnnual}
            onChange={() => onSelect(true)}
          />
          Annual{' '}
          <span aria-hidden='true' className='text-(--linear-accent)'>
            -{savingsPercent}%
          </span>
        </label>
      </div>
    </fieldset>
  );
}

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
  isDefaultUpsell,
}: OnboardingCheckoutClientProps) {
  const searchParams = useSearchParams();
  // Pre-compute savings to determine annual default
  const hasAnnualOption = annualPriceId !== null && annualAmount !== null;
  const annualSavingsPercent = hasAnnualOption
    ? getAnnualSavingsPercent(monthlyAmount, annualAmount)
    : 0;
  const [isAnnual, setIsAnnual] = useState(annualSavingsPercent > 25);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planMarketing = getEntitlements(plan).marketing;

  const currentPriceId =
    isAnnual && annualPriceId !== null ? annualPriceId : monthlyPriceId;
  const currentAmount =
    isAnnual && annualAmount !== null ? annualAmount : monthlyAmount;
  const interval = isAnnual ? 'year' : 'month';
  const returnTo = normalizeOnboardingReturnTo(searchParams.get('returnTo'));

  useEffect(() => {
    track('onboarding_checkout_shown', {
      plan,
      has_spotify: !!spotifyFollowers,
      has_annual: !!hasAnnualOption,
      intent_source: isDefaultUpsell ? 'upsell_intercept' : 'paid_intent',
    });
  }, [plan, spotifyFollowers, hasAnnualOption, isDefaultUpsell]);

  const handleCheckout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    track('onboarding_checkout_initiated', {
      plan,
      price_id: currentPriceId,
      interval,
      intent_source: isDefaultUpsell ? 'upsell_intercept' : 'paid_intent',
    });

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: currentPriceId,
          returnTo,
          source: 'onboarding',
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? 'Checkout failed. Please try again.');
      }

      const data = (await response.json()) as { url?: string };
      if (data.url) {
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
  }, [plan, currentPriceId, interval, isDefaultUpsell, returnTo]);

  const handleSkip = useCallback(() => {
    track('onboarding_checkout_skipped', {
      plan,
      intent_source: isDefaultUpsell ? 'upsell_intercept' : 'paid_intent',
    });
    clearPlanIntent();
    globalThis.location.href = returnTo;
  }, [isDefaultUpsell, plan, returnTo]);

  return (
    <div className='flex flex-col items-center justify-center'>
      <div className={`w-full max-w-md ${FORM_LAYOUT.formContainer}`}>
        <div className={FORM_LAYOUT.headerSection}>
          <h1 className={FORM_LAYOUT.title}>
            Upgrade to {planMarketing.displayName}
          </h1>
          <p className={FORM_LAYOUT.hint}>
            {isDefaultUpsell && username
              ? `Congrats! Your profile is live at jov.ie/${username}. Want to make it even better?`
              : `Your profile is live. See what ${planMarketing.displayName} unlocks.`}
          </p>
        </div>

        <ProfilePreviewCard
          avatarUrl={avatarUrl}
          displayName={displayName}
          spotifyFollowers={spotifyFollowers}
          username={username}
        />

        {/* Pro highlights */}
        <ContentSurfaceCard className='mb-6 p-4'>
          <div className='space-y-2.5'>
            {PRO_HIGHLIGHTS.map(item => (
              <div key={item.label} className='flex items-start gap-3'>
                <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-1'>
                  <item.icon className='h-4 w-4 text-(--linear-accent)' />
                </div>
                <div>
                  <p className='text-[13px] font-medium text-primary-token'>
                    {item.label}
                  </p>
                  <p className='text-[12px] text-tertiary-token'>
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ContentSurfaceCard>

        {/* Annual toggle */}
        {hasAnnualOption ? (
          <BillingIntervalSelector
            isAnnual={isAnnual}
            savingsPercent={annualSavingsPercent}
            onSelect={setIsAnnual}
          />
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
          <ContentSurfaceCard
            className='mb-4 border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] text-destructive'
            role='alert'
          >
            {error}
          </ContentSurfaceCard>
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
          {isDefaultUpsell
            ? 'Start free, upgrade anytime'
            : 'Continue with Free'}
        </button>
      </div>
    </div>
  );
}
