'use client';

import { Button } from '@jovie/ui';
import {
  BarChart3,
  Bell,
  PartyPopper,
  Rocket,
  ShieldCheck,
  Sparkles,
  Upload,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfettiOverlay } from '@/components/atoms/Confetti';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { APP_ROUTES } from '@/constants/routes';
import { page, track } from '@/lib/analytics';
import {
  getPlanDisplayName,
  resolveCanonicalPlanId,
} from '@/lib/entitlements/registry';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useBillingStatusQuery } from '@/lib/queries';

interface UnlockTile {
  readonly icon: typeof Bell;
  readonly title: string;
  readonly description: string;
}

const PRO_UNLOCK_TILES: readonly UnlockTile[] = [
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
];

const MAX_UNLOCK_TILES: readonly UnlockTile[] = [
  {
    icon: Workflow,
    title: 'Release Plan Generation',
    description: 'AI drafts your full release plan with tasks and deadlines.',
  },
  {
    icon: Rocket,
    title: 'Metadata Submission Agent',
    description: 'Hands-off DSP metadata submission with approval workflow.',
  },
  {
    icon: BarChart3,
    title: 'Unlimited Analytics',
    description: 'No retention cap. Full history across every release.',
  },
];

const GENERIC_UNLOCK_TILES: readonly UnlockTile[] = [
  {
    icon: Sparkles,
    title: 'Your plan is active',
    description: 'New capabilities are unlocked and ready to use.',
  },
  {
    icon: BarChart3,
    title: 'Track what works',
    description: 'Analytics and audience insights refresh automatically.',
  },
  {
    icon: Upload,
    title: 'Own your audience',
    description: 'Contacts, exports, and smart links stay in your control.',
  },
];

function resolveUnlockTiles(
  canonicalPlan: string | null
): readonly UnlockTile[] {
  if (canonicalPlan === 'max') return MAX_UNLOCK_TILES;
  if (canonicalPlan === 'pro' || canonicalPlan === 'trial')
    return PRO_UNLOCK_TILES;
  return GENERIC_UNLOCK_TILES;
}

function getVerificationButtonLabel(state: string): string {
  if (state === 'success') return 'Verification requested';
  if (state === 'submitting') return 'Sending request...';
  return 'Request Verification';
}

function FeatureCard({ icon: Icon, title, description }: UnlockTile) {
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
  const rawPlanIdParam = searchParams.get('plan_id');
  const [requestState, setRequestState] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const { data: billingData } = useBillingStatusQuery();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Resolve the plan used for display ONCE per render. We prefer the validated
  // Stripe session `plan_id` (authoritative at checkout) over `billingData.plan`
  // (eventually consistent via webhook). If both miss validation, we fall
  // through to a generic "new plan" rendering — we never want to display
  // "Welcome to Free" just because a value could not be recognized.
  const resolvedPlan = useMemo<{
    readonly canonical: 'free' | 'trial' | 'pro' | 'max' | null;
    readonly displayName: string | null;
  }>(() => {
    const fromParam = resolveCanonicalPlanId(rawPlanIdParam);
    if (fromParam && fromParam !== 'free') {
      return {
        canonical: fromParam,
        displayName: getPlanDisplayName(fromParam),
      };
    }
    const fromBilling = resolveCanonicalPlanId(billingData?.plan ?? null);
    if (fromBilling && fromBilling !== 'free') {
      return {
        canonical: fromBilling,
        displayName: getPlanDisplayName(fromBilling),
      };
    }
    return { canonical: null, displayName: null };
  }, [rawPlanIdParam, billingData?.plan]);

  const unlockTiles = useMemo(
    () => resolveUnlockTiles(resolvedPlan.canonical),
    [resolvedPlan.canonical]
  );

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

    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [prefersReducedMotion]);

  const onboardingTrackedRef = useRef(false);
  useEffect(() => {
    if (!resolvedPlan.canonical) return;
    track('checkout_celebration_shown', { planType: resolvedPlan.canonical });
    if (isOnboardingUpgrade && !onboardingTrackedRef.current) {
      onboardingTrackedRef.current = true;
      track('onboarding_upgrade_success', { plan: resolvedPlan.canonical });
    }
  }, [isOnboardingUpgrade, resolvedPlan.canonical]);

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
    : resolvedPlan.displayName
      ? `Welcome to ${resolvedPlan.displayName}!`
      : 'Welcome to your new plan!';
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
      {prefersReducedMotion ? null : <ConfettiOverlay viewport />}

      <ContentSurfaceCard surface='details' className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title={successTitle}
          subtitle={successSubtitle}
        />

        <div
          className={
            prefersReducedMotion
              ? 'space-y-6 px-5 py-5 text-center sm:px-6'
              : isVisible
                ? 'space-y-6 px-5 py-5 text-center opacity-100 translate-y-0 scale-100 transition-all duration-700 ease-out sm:px-6'
                : 'space-y-6 px-5 py-5 text-center opacity-0 translate-y-6 scale-[0.98] transition-all duration-700 ease-out sm:px-6'
          }
        >
          <div className='mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/20 bg-success-subtle'>
            <PartyPopper className='h-8 w-8 text-success' />
          </div>

          <div className='grid gap-4 sm:grid-cols-3'>
            {unlockTiles.map(tile => (
              <FeatureCard key={tile.title} {...tile} />
            ))}
          </div>

          <div className='flex flex-col items-center gap-3'>
            <Button asChild size='lg'>
              <Link href={APP_ROUTES.CHAT}>
                {isOnboardingUpgrade ? 'Explore your dashboard' : 'Go to chat'}
              </Link>
            </Button>
            {isOnboardingUpgrade ? null : (
              <Button asChild variant='ghost' size='sm'>
                <Link href={APP_ROUTES.DASHBOARD_RELEASES}>
                  View your releases
                </Link>
              </Button>
            )}

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
