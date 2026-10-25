'use client';

import { Button } from '@jovie/ui';
import {
  BarChart3,
  Check,
  CircleCheck,
  Eye,
  Loader2,
  Radar,
  Rocket,
  ShieldCheck,
  Workflow,
  Wrench,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { UpgradeButton } from '@/components/molecules/UpgradeButton';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { APP_ROUTES } from '@/constants/routes';
import { announceOncePerEvent } from '@/lib/a11y/announce';
import { page, track } from '@/lib/analytics';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { useBillingStatusQuery } from '@/lib/queries';
import {
  ARTIST_VISIBILITY_ACTIVATION_COPY,
  ARTIST_VISIBILITY_ACTIVATION_STEPS,
  CHECKOUT_PENDING_COPY,
  CHECKOUT_RECOVERY_COPY,
  CHECKOUT_SUCCESS_HOLD_MS,
  getCheckoutSuccessAnnouncement,
  getPaidSuccessPrimaryHref,
  getPaidSuccessPrimaryLabel,
  isArtistVisibilityPlan,
  type PaidPlanId,
  resolveCanonicalPlan,
  resolveCheckoutReturnFeature,
  resolveCheckoutSuccessView,
  resolvePaidPlan,
  shouldCelebratePaidSuccess,
  withHeadingFocusParam,
} from './checkout-success-state';

const MAX_UNLOCK_TILES = [
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
] as const;

const ARTIST_VISIBILITY_STEP_ICONS = {
  monitor: Eye,
  surface: Radar,
  approve: CircleCheck,
  fix: Wrench,
} as const;

async function fetchValidatedSession(
  sessionId: string,
  signal: AbortSignal
): Promise<{ plan: PaidPlanId | null; needsProfile: boolean }> {
  const response = await fetch(
    `/api/billing/checkout-session?session_id=${encodeURIComponent(sessionId)}`,
    { cache: 'no-store', signal }
  );
  if (!response.ok) return { plan: null, needsProfile: false };
  const body = (await response.json()) as {
    plan?: string | null;
    needsProfile?: boolean;
  };
  return {
    plan: resolvePaidPlan(body.plan ?? null),
    needsProfile: body.needsProfile === true,
  };
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  status,
}: {
  readonly icon: typeof Eye;
  readonly title: string;
  readonly description: string;
  readonly status?: string;
}) {
  return (
    <ContentSurfaceCard surface='nested' className='space-y-2 p-4 text-left'>
      <Icon className='h-5 w-5 text-accent' aria-hidden='true' />
      <p className='text-app font-semibold text-primary-token'>{title}</p>
      <p className='text-xs leading-5 text-tertiary-token'>{description}</p>
      {status ? (
        <p className='text-2xs font-medium text-secondary-token'>{status}</p>
      ) : null}
    </ContentSurfaceCard>
  );
}

/**
 * JOV-9035 spinner-to-check beat. Stroke draw 250ms ease-out plus scale
 * 0.9 -> 1 spring, on the canonical lucide check geometry. Reduced motion
 * REPLACES the transform with a static check and a --duration-fast opacity
 * fade: no transform ever changes under reduced motion.
 */
function CheckoutSuccessCheck({ reduced }: { readonly reduced: boolean }) {
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const style: React.CSSProperties = reduced
    ? {
        transition: 'opacity var(--duration-fast) var(--ease-out)',
        opacity: drawn ? 1 : 0,
      }
    : {
        transition:
          'stroke-dashoffset var(--duration-slow) var(--ease-out), transform var(--duration-slow) var(--ease-spring)',
        strokeDasharray: '23px',
        strokeDashoffset: drawn ? 0 : 23,
        transform: drawn ? 'scale(1)' : 'scale(0.9)',
      };

  return (
    <Check
      className='h-8 w-8 text-success'
      aria-hidden='true'
      data-testid='checkout-success-check'
      style={style}
    />
  );
}

function getVerificationButtonLabel(state: string): string {
  if (state === 'success') return 'Verification requested';
  if (state === 'submitting') return 'Sending request...';
  return 'Request Verification';
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isOnboardingUpgrade = searchParams.get('source') === 'onboarding';
  const checkoutSessionId = searchParams.get('session_id');
  const rawPlanIdParam = searchParams.get('plan_id');
  const fromFeature = resolveCheckoutReturnFeature(searchParams.get('from'));
  const [requestState, setRequestState] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const {
    data: billingData,
    isLoading: isBillingLoading,
    isFetched: isBillingFetched,
    error: billingError,
  } = useBillingStatusQuery();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hasHydratedMotion, setHasHydratedMotion] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isSessionPlanPending, setIsSessionPlanPending] = useState(
    Boolean(checkoutSessionId)
  );
  const [validatedSessionPlan, setValidatedSessionPlan] =
    useState<PaidPlanId | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const shouldSuppressMotion = hasHydratedMotion && prefersReducedMotion;
  const isBillingPending =
    !checkoutSessionId &&
    isBillingLoading === true &&
    billingData === undefined &&
    isBillingFetched !== true &&
    billingError == null;
  const conversionTrackedRef = useRef(false);
  const onboardingTrackedRef = useRef(false);
  const celebrationTrackedRef = useRef(false);
  const momentFiredRef = useRef(false);
  const momentNavigatedRef = useRef(false);
  const momentArmTimeRef = useRef<number | null>(null);
  const primaryCtaRef = useRef<HTMLAnchorElement | null>(null);

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

    void fetchValidatedSession(sessionId, controller.signal)
      .then(session => {
        if (controller.signal.aborted) return;
        setValidatedSessionPlan(session.plan);
        setNeedsProfile(session.needsProfile);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        console.error(
          '[billing/success] checkout session validation failed',
          error
        );
        setValidatedSessionPlan(null);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setIsSessionPlanPending(false);
      });

    return () => controller.abort();
  }, [checkoutSessionId]);

  const view = useMemo(
    () =>
      resolveCheckoutSuccessView({
        checkoutSessionId,
        isSessionPlanPending,
        validatedSessionPlan,
        billingPlan: billingData?.plan,
        isBillingPending,
      }),
    [
      billingData?.plan,
      checkoutSessionId,
      isBillingPending,
      isSessionPlanPending,
      validatedSessionPlan,
    ]
  );

  const resolvedPlan = useMemo(
    () =>
      view.kind === 'success'
        ? resolveCanonicalPlan(
            billingData?.plan,
            rawPlanIdParam,
            validatedSessionPlan
          )
        : { canonical: null, displayName: null },
    [billingData?.plan, rawPlanIdParam, validatedSessionPlan, view.kind]
  );

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

  useEffect(() => {
    if (!shouldCelebratePaidSuccess(view) || conversionTrackedRef.current) {
      return;
    }
    conversionTrackedRef.current = true;
    track('subscription_success', {
      flow_type: 'checkout',
      page: 'success',
    });
    page('checkout_success', {
      page_type: 'billing',
      section: 'success',
      conversion: true,
    });
  }, [view]);

  useEffect(() => {
    if (!shouldCelebratePaidSuccess(view)) return;
    if (checkoutSessionId && isSessionPlanPending) return;
    if (!celebrationTrackedRef.current) {
      celebrationTrackedRef.current = true;
      track('checkout_celebration_shown', { planType: view.plan });
    }
    if (isOnboardingUpgrade && !onboardingTrackedRef.current) {
      onboardingTrackedRef.current = true;
      track('onboarding_upgrade_success', { plan: view.plan });
    }
  }, [checkoutSessionId, isOnboardingUpgrade, isSessionPlanPending, view]);

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

  const paidDisplayName =
    resolvedPlan.displayName ??
    (view.kind === 'success' ? view.displayName : null);

  /*
   * JOV-9035 checkout success moment: acknowledge once per checkout session
   * BEFORE any redirect, then land on the unlocked feature (the `from` route
   * when it is allowlisted), focusing its main heading on arrival. The hold
   * is non-blocking: the primary CTA stays reachable the whole time.
   */
  useEffect(() => {
    if (
      view.kind !== 'success' ||
      !checkoutSessionId ||
      isSessionPlanPending ||
      momentNavigatedRef.current
    ) {
      return;
    }

    if (!momentFiredRef.current) {
      momentFiredRef.current = true;
      announceOncePerEvent(
        checkoutSessionId,
        getCheckoutSuccessAnnouncement(view.displayName)
      );
      primaryCtaRef.current?.focus();
    }

    // Deps can change mid-hold (billing query landing, plan resolution);
    // re-arming keeps the original arm time so the acknowledgement hold
    // never restarts and never exceeds CHECKOUT_SUCCESS_HOLD_MS.
    if (momentArmTimeRef.current === null) {
      momentArmTimeRef.current = Date.now();
    }
    const remainingMs = Math.max(
      0,
      CHECKOUT_SUCCESS_HOLD_MS - (Date.now() - momentArmTimeRef.current)
    );
    const timer = setTimeout(() => {
      if (momentNavigatedRef.current) return;
      momentNavigatedRef.current = true;
      router.replace(
        withHeadingFocusParam(
          getPaidSuccessPrimaryHref({
            plan: view.plan,
            isOnboardingUpgrade,
            needsProfile,
            fromFeature,
          })
        )
      );
    }, remainingMs);
    return () => clearTimeout(timer);
  }, [
    checkoutSessionId,
    fromFeature,
    isOnboardingUpgrade,
    isSessionPlanPending,
    needsProfile,
    router,
    view,
  ]);

  const isArtistVisibilitySuccess =
    view.kind === 'success' && isArtistVisibilityPlan(view.plan);
  let successTitle: string;
  if (view.kind !== 'success') {
    successTitle =
      view.kind === 'pending'
        ? CHECKOUT_PENDING_COPY.title
        : CHECKOUT_RECOVERY_COPY.title;
  } else if (isOnboardingUpgrade) {
    successTitle = 'Your profile is live and upgraded';
  } else if (paidDisplayName) {
    successTitle = `Welcome to ${paidDisplayName}!`;
  } else {
    successTitle = CHECKOUT_RECOVERY_COPY.title;
  }

  let successSubtitle: string;
  if (view.kind === 'pending') {
    successSubtitle = CHECKOUT_PENDING_COPY.subtitle;
  } else if (view.kind === 'recovery') {
    successSubtitle = CHECKOUT_RECOVERY_COPY.subtitle;
  } else if (isOnboardingUpgrade) {
    successSubtitle = isArtistVisibilitySuccess
      ? "You're all set. Artist Visibility is ready to start."
      : "You're all set. Here's what you just unlocked.";
  } else if (isArtistVisibilitySuccess) {
    successSubtitle = ARTIST_VISIBILITY_ACTIVATION_COPY.next;
  } else {
    successSubtitle = "Your plan is active. Here's what you just unlocked.";
  }

  let contentClassName: string;
  if (shouldSuppressMotion) {
    contentClassName = 'space-y-6 px-5 py-5 text-center sm:px-6';
  } else if (isVisible) {
    contentClassName =
      'space-y-6 px-5 py-5 text-center opacity-100 translate-y-0 scale-100 transition-[opacity,transform] duration-cinematic ease-out sm:px-6';
  } else {
    contentClassName =
      'space-y-6 px-5 py-5 text-center opacity-0 translate-y-6 scale-[0.98] transition-[opacity,transform] duration-cinematic ease-out sm:px-6';
  }

  const viewTestId =
    view.kind === 'pending'
      ? 'checkout-success-pending'
      : view.kind === 'recovery'
        ? 'checkout-success-recovery'
        : 'checkout-success-paid';

  return (
    <StandaloneProductPage
      width='lg'
      centered
      className='relative'
      contentClassName='relative z-10'
    >
      <ContentSurfaceCard
        surface='details'
        className='overflow-hidden'
        data-testid={viewTestId}
      >
        <ContentSectionHeader
          density='compact'
          title={successTitle}
          subtitle={successSubtitle}
        />

        <div className={contentClassName}>
          <div
            className={
              view.kind === 'pending'
                ? 'mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-subtle bg-surface-2'
                : view.kind === 'recovery'
                  ? 'mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-warning/20 bg-warning-subtle'
                  : 'mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-success/20 bg-success-subtle'
            }
            aria-busy={view.kind === 'pending' ? true : undefined}
          >
            {view.kind === 'pending' ? (
              <Loader2
                className='h-8 w-8 animate-spin text-secondary-token'
                aria-hidden='true'
              />
            ) : view.kind === 'recovery' ? (
              <XCircle className='h-8 w-8 text-warning' aria-hidden='true' />
            ) : (
              <CheckoutSuccessCheck reduced={shouldSuppressMotion} />
            )}
          </div>

          {view.kind === 'success' && isArtistVisibilitySuccess ? (
            <div
              className='space-y-4'
              data-testid='artist-visibility-activation'
            >
              <p className='text-app font-semibold text-primary-token'>
                {ARTIST_VISIBILITY_ACTIVATION_COPY.status}
              </p>
              <div className='grid gap-4 sm:grid-cols-2'>
                {ARTIST_VISIBILITY_ACTIVATION_STEPS.map(step => (
                  <FeatureCard
                    key={step.key}
                    icon={ARTIST_VISIBILITY_STEP_ICONS[step.key]}
                    title={step.title}
                    description={step.description}
                    status={step.status}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {view.kind === 'success' && !isArtistVisibilitySuccess ? (
            <div className='grid gap-4 sm:grid-cols-3'>
              {MAX_UNLOCK_TILES.map(tile => (
                <FeatureCard key={tile.title} {...tile} />
              ))}
            </div>
          ) : null}

          <div className='flex flex-col items-center gap-3'>
            {view.kind === 'recovery' ? (
              <>
                <UpgradeButton
                  className='w-full sm:w-auto [&_button]:w-full'
                  size='lg'
                >
                  Retry checkout
                </UpgradeButton>
                <Button asChild variant='secondary' size='lg'>
                  <Link href={APP_ROUTES.SUPPORT}>Contact support</Link>
                </Button>
                <Button asChild variant='ghost' size='sm'>
                  <Link href={APP_ROUTES.HOME}>Go home</Link>
                </Button>
              </>
            ) : view.kind === 'success' ? (
              <>
                <Button asChild size='lg'>
                  <Link
                    ref={primaryCtaRef}
                    href={getPaidSuccessPrimaryHref({
                      plan: view.plan,
                      isOnboardingUpgrade,
                      needsProfile,
                      fromFeature,
                    })}
                  >
                    {getPaidSuccessPrimaryLabel({
                      plan: view.plan,
                      isOnboardingUpgrade,
                      needsProfile,
                      fromFeature,
                    })}
                  </Link>
                </Button>
                {isOnboardingUpgrade || isArtistVisibilitySuccess ? null : (
                  <Button asChild variant='ghost' size='sm'>
                    <Link href={APP_ROUTES.RELEASES}>View your releases</Link>
                  </Button>
                )}
                {billingData?.isPro ? (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    onClick={handleRequestVerification}
                    disabled={
                      requestState === 'submitting' ||
                      requestState === 'success'
                    }
                  >
                    <ShieldCheck className='h-4 w-4' aria-hidden='true' />
                    {getVerificationButtonLabel(requestState)}
                  </Button>
                ) : null}
                {feedback ? (
                  <output
                    className='text-app text-secondary-token'
                    aria-live='polite'
                    aria-atomic='true'
                  >
                    {feedback}
                  </output>
                ) : null}
              </>
            ) : (
              <p className='text-app text-secondary-token'>
                Confirming your checkout session. This usually takes a few
                seconds.
              </p>
            )}
          </div>
        </div>
      </ContentSurfaceCard>
    </StandaloneProductPage>
  );
}
