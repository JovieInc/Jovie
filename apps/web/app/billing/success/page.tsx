'use client';

import { Button } from '@jovie/ui';
import {
  BarChart3,
  Bell,
  PartyPopper,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ConfettiOverlay } from '@/components/atoms/Confetti';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { APP_ROUTES } from '@/constants/routes';
import { page, track } from '@/lib/analytics';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import { useBillingStatusQuery } from '@/lib/queries';

const UNLOCKED_FEATURES = [
  {
    icon: Bell,
    title: 'Release Notifications',
    description: 'Reach fans automatically when your next release goes live.',
  },
  {
    icon: BarChart3,
    title: 'Advanced Analytics',
    description: 'See 90-day trends, audience demographics, and more.',
  },
  {
    icon: Upload,
    title: 'Contact Export',
    description: 'Download your fan list and use it anywhere.',
  },
] as const;

function getVerificationButtonLabel(state: string): string {
  if (state === 'success') return 'Verification requested';
  if (state === 'submitting') return 'Sending request...';
  return 'Request Verification';
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: Readonly<(typeof UNLOCKED_FEATURES)[number]>) {
  return (
    <ContentSurfaceCard surface='nested' className='space-y-2 p-4 text-left'>
      <Icon className='h-5 w-5 text-accent' aria-hidden='true' />
      <p className='text-[13px] font-semibold text-primary-token'>{title}</p>
      <p className='text-[12px] leading-5 text-tertiary-token'>{description}</p>
    </ContentSurfaceCard>
  );
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const isOnboardingUpgrade = searchParams.get('source') === 'onboarding';
  const [requestState, setRequestState] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const { data: billingData } = useBillingStatusQuery();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const planName = getPlanDisplayName(billingData?.plan);

  useEffect(() => {
    track('subscription_success', {
      flow_type: 'checkout',
      page: 'success',
    });
    page('checkout_success', {
      page_type: 'billing',
      section: 'success',
      conversion: true,
    });

    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const onboardingTrackedRef = useRef(false);
  useEffect(() => {
    if (!billingData?.plan) return;
    track('checkout_celebration_shown', { planType: billingData.plan });
    if (isOnboardingUpgrade && !onboardingTrackedRef.current) {
      onboardingTrackedRef.current = true;
      track('onboarding_upgrade_success', { plan: billingData.plan });
    }
  }, [billingData?.plan, isOnboardingUpgrade]);

  const handleRequestVerification = async () => {
    if (requestState === 'submitting') return;

    setRequestState('submitting');
    setFeedback(null);

    try {
      const response = await fetch('/api/verification/request', {
        method: 'POST',
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error ??
            'We could not send your request. Please try again in a moment.'
        );
      }

      track('verification_request_submitted', {
        source: 'billing_success',
      });
      setRequestState('success');
      setFeedback('Request sent. Tim has been notified.');
    } catch (error) {
      setRequestState('error');
      setFeedback(
        error instanceof Error
          ? error.message
          : 'We could not send your request. Please try again in a moment.'
      );
    }
  };

  const successTitle = isOnboardingUpgrade
    ? 'Your profile is live and upgraded'
    : `Welcome to ${planName}!`;
  const successSubtitle = isOnboardingUpgrade
    ? "You're all set. Here's what you just unlocked."
    : "Your plan is active. Here's what you just unlocked.";

  return (
    <StandaloneProductPage
      width='lg'
      centered
      className='relative'
      contentClassName='relative z-10'
    >
      <ConfettiOverlay viewport />

      <ContentSurfaceCard surface='details' className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title={successTitle}
          subtitle={successSubtitle}
        />

        <div
          className={
            isVisible
              ? 'space-y-6 px-5 py-5 text-center opacity-100 translate-y-0 scale-100 transition-all duration-700 ease-out sm:px-6'
              : 'space-y-6 px-5 py-5 text-center opacity-0 translate-y-6 scale-[0.98] transition-all duration-700 ease-out sm:px-6'
          }
        >
          <div className='mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/20 bg-success-subtle'>
            <PartyPopper className='h-8 w-8 text-success' />
          </div>

          <div className='grid gap-4 sm:grid-cols-3'>
            {UNLOCKED_FEATURES.map(feature => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>

          <div className='flex flex-col items-center gap-3'>
            <Button asChild size='lg'>
              <Link href={APP_ROUTES.DASHBOARD}>
                {isOnboardingUpgrade
                  ? 'Explore your dashboard'
                  : 'Go to Dashboard'}
              </Link>
            </Button>

            {billingData?.isPro ? (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={handleRequestVerification}
                disabled={
                  requestState === 'submitting' || requestState === 'success'
                }
              >
                <ShieldCheck className='h-4 w-4' aria-hidden='true' />
                {getVerificationButtonLabel(requestState)}
              </Button>
            ) : null}

            {feedback ? (
              <output
                className='text-[13px] text-secondary-token'
                aria-live='polite'
                aria-atomic='true'
              >
                {feedback}
              </output>
            ) : null}
          </div>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
