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
  type PlanId,
  resolveCanonicalPlanId,
} from '@/lib/entitlements/registry';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useBillingStatusQuery } from '@/lib/queries';

interface UnlockTile {
  readonly icon: typeof Bell;
  readonly title: string;
  readonly description: string;
}

type PaidPlanId = Exclude<PlanId, 'free'>;

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
  canonicalPlan: PaidPlanId | null
): readonly UnlockTile[] {
  if (canonicalPlan === 'max') return MAX_UNLOCK_TILES;
  if (canonicalPlan === 'pro' || canonicalPlan === 'trial')
    return PRO_UNLOCK_TILES;
  return GENERIC_UNLOCK_TILES;
}

function resolvePaidPlan(plan: string | null | undefined): PaidPlanId | null {
  const canonical = resolveCanonicalPlanId(plan);
  return canonical && canonical !== 'free' ? canonical : null;
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
  const checkoutSessionId = searchParams.get('session_id');
  const rawPlanIdParam = searchParams.get('plan_id');
  const [requestState, setRequestState] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const { data: billingData } = useBillingStatusQuery();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hasHydratedMotion, setHasHydratedMotion] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isSessionPlanPending, setIsSessionPlanPending] = useState(
    Boolean(checkoutSessionId)
  );
  const [validatedSessionPlan, setValidatedSessionPlan] =
    useState<PaidPlanId | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const shouldSuppressMotion = hasHydratedMotion && prefersReducedMotion;

  useEffect(() => {
    setHasHydratedMotion(true);
  }, []);

  useEffect(() => {
    if (!checkoutSessionId) {
      setIsSessionPlanPending(false);
      setValidatedSessionPlan(null);
      return;
    }

    const sessionId = checkoutSessionId;
    const controller = new AbortController();
    setIsSessionPlanPending(true);

    async function validateCheckoutSession() {
      try {
        const response = await fetch(
          `/api/billing/checkout-session?session_id=${encodeURIComponent(sessionId)}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          setValidatedSessionPlan(null);
          return;
        }

        const body = (await response.json()) as { plan?: string | null };
        setValidatedSessionPlan(resolvePaidPlan(body.plan ?? null));
      } catch (_error) {
        if (controller.signal.aborted) return;
        setValidatedSessionPlan(null);
      } finally {
        if (controller.signal.aborted) return;
        setIsSessionPlanPending(false);
      }
    }

    void validateCheckoutSession();

    return () => controller.abort();
  }, [checkoutSessionId]);

  const resolvedPlan = useMemo<{
    readonly canonical: PaidPlanId | null;
    readonly displayName: string | null;
  }>(() => {
    const fromBilling = resolvePaidPlan(billingData?.plan ?? null);
    const fromParam = resolvePaidPlan(rawPlanIdParam);
    const validatedParam =
      fromParam &&
      (fromParam === validatedSessionPlan ||
        (!validatedSessionPlan && fromParam === fromBilling))
        ? fromParam
        : null;
    const canonicalPlan = validatedParam ?? validatedSessionPlan ?? fromBilling;

    if (canonicalPlan) {
      return {
        canonical: canonicalPlan,
        displayName: getPlanDisplayName(canonicalPlan),
      };
    }

    return { canonical: null, displayName: null };
  }, [billingData?.plan, rawPlanIdParam, validatedSessionPlan]);

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
  }, []);

  useEffect(() => {
    if (!hasHydratedMotion) return;

    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    setIsVisible(false);
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [hasHydratedMotion, prefersReducedMotion]);

  const onboardingTrackedRef = useRef(false);
  const celebrationTrackedRef = useRef(false);
  useEffect(() => {
    if (!resolvedPlan.canonical) return;
    if (checkoutSessionId && isSessionPlanPending) return;
    if (!celebrationTrackedRef.current) {
      celebrationTrackedRef.current = true;
      track('checkout_celebration_shown', { planType: resolvedPlan.canonical });
    }
    if (isOnboardingUpgrade && !onboardingTrackedRef.current) {
      onboardingTrackedRef.current = true;
      track('onboarding_upgrade_success', { plan: resolvedPlan.canonical });
    }
  }, [
    checkoutSessionId,
    isOnboardingUpgrade,
    isSessionPlanPending,
    resolvedPlan.canonical,
  ]);

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
      setFeedback('Request sent. Our team has been notified.');
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
      {shouldSuppressMotion ? null : hasHydratedMotion ? (
        <ConfettiOverlay viewport />
      ) : null}

      <ContentSurfaceCard surface='details' className='overflow-hidden'>
        <ContentSectionHeader
          density='compact'
          title={successTitle}
          subtitle={successSubtitle}
        />

        <div
          className={
            shouldSuppressMotion
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
              <Link
                href={
                  isOnboardingUpgrade ? APP_ROUTES.DASHBOARD : APP_ROUTES.CHAT
                }
              >
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
