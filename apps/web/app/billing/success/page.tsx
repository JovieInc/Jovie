'use client';

import { Button } from '@jovie/ui';
import {
  BadgeCheck,
  BarChart3,
  CalendarClock,
  CircleCheck,
  Loader2,
  Mail,
  Rocket,
  ShieldCheck,
  Workflow,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { CheckoutUnlockCards } from '@/components/organisms/billing/CheckoutUnlockCards';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { APP_ROUTES } from '@/constants/routes';
import { page, track } from '@/lib/analytics';
import { PROOF_PENDING_TERMS } from '@/lib/claim/proof-terms';
import { useBillingStatusQuery } from '@/lib/queries';
import {
  ARTIST_VISIBILITY_ACTIVATION_COPY,
  ARTIST_VISIBILITY_ACTIVATION_STEPS,
  ARTIST_VISIBILITY_SHARE_PROMPT,
  CHECKOUT_PENDING_COPY,
  CHECKOUT_RECOVERY_COPY,
  getPaidSuccessPrimaryHref,
  getPaidSuccessPrimaryLabel,
  isArtistVisibilityPlan,
  resolveCheckoutSuccessView,
} from './checkout-success-state';
import { useCheckoutConfirmation } from './use-checkout-confirmation';

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
  notify: Mail,
  prerelease: CalendarClock,
  analytics: BarChart3,
  verify: BadgeCheck,
} as const;

function FeatureCard({
  icon: Icon,
  title,
  description,
  status,
}: {
  readonly icon: typeof Mail;
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

function getVerificationButtonLabel(state: string): string {
  if (state === 'success') return 'Verification requested';
  if (state === 'submitting') return 'Sending request...';
  return 'Request Verification';
}

export default function CheckoutSuccessPage() {
  const sessionId = useSearchParams().get('session_id');
  return <CheckoutSuccessContent key={sessionId ?? 'no-session'} />;
}

function CheckoutSuccessContent() {
  const searchParams = useSearchParams();
  const isOnboardingUpgrade = searchParams.get('source') === 'onboarding';
  const checkoutSessionId = searchParams.get('session_id');
  const [requestState, setRequestState] = useState<
    'idle' | 'submitting' | 'success' | 'error'
  >('idle');
  const { data: billingData } = useBillingStatusQuery();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const {
    receipt,
    pending: isSessionPlanPending,
    retry,
  } = useCheckoutConfirmation(checkoutSessionId);
  const { needsProfile, proofPending, shareUrl } = receipt;
  const viewedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const view = useMemo(
    () =>
      resolveCheckoutSuccessView({
        checkoutSessionId,
        isSessionPlanPending,
        validatedSessionPlan: receipt.plan,
        confirmationStatus: receipt.status,
        paymentStatus: receipt.paymentStatus,
      }),
    [checkoutSessionId, isSessionPlanPending, receipt]
  );

  useEffect(() => {
    if (
      view.kind !== 'success' ||
      !checkoutSessionId ||
      viewedSessionRef.current === checkoutSessionId
    )
      return;
    viewedSessionRef.current = checkoutSessionId;
    // This is a page view, never a new purchase. Verified webhook receipts
    // already own durable conversion analytics, including retries/replays.
    page('checkout_success', {
      page_type: 'billing',
      section: 'success',
      conversion: false,
    });
  }, [checkoutSessionId, view]);

  const canNativeShare =
    hasHydrated &&
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function';
  const handleNativeShare = (url: string) => {
    void navigator
      .share({ url, text: ARTIST_VISIBILITY_SHARE_PROMPT.shareText })
      .catch(() => undefined);
  };

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

  const paidDisplayName = view.kind === 'success' ? view.displayName : null;
  const isArtistVisibilitySuccess =
    view.kind === 'success' && isArtistVisibilityPlan(view.plan);
  let successTitle: string;
  if (view.kind !== 'success') {
    successTitle =
      view.kind === 'pending'
        ? CHECKOUT_PENDING_COPY.title
        : CHECKOUT_RECOVERY_COPY.title;
  } else if (isOnboardingUpgrade && proofPending) {
    successTitle = 'Your plan is active';
  } else if (isOnboardingUpgrade) {
    successTitle = shareUrl ? 'Your profile is live' : 'Your plan is active';
  } else if (paidDisplayName) {
    successTitle = `${paidDisplayName} plan confirmed`;
  } else {
    successTitle = CHECKOUT_RECOVERY_COPY.title;
  }

  let successSubtitle: string;
  if (view.kind === 'pending') {
    successSubtitle = CHECKOUT_PENDING_COPY.subtitle;
  } else if (view.kind === 'recovery') {
    successSubtitle = CHECKOUT_RECOVERY_COPY.subtitle;
  } else if (isOnboardingUpgrade && proofPending) {
    successSubtitle = PROOF_PENDING_TERMS;
  } else if (isOnboardingUpgrade) {
    successSubtitle = isArtistVisibilitySuccess
      ? `You're all set. ${ARTIST_VISIBILITY_ACTIVATION_COPY.status}.`
      : "Here's what's included with your plan.";
  } else if (isArtistVisibilitySuccess) {
    successSubtitle = ARTIST_VISIBILITY_ACTIVATION_COPY.next;
  } else {
    successSubtitle = "Your plan is active. Here's what's included.";
  }

  // The page settles in place: no confetti, no entrance slide and no vertical
  // centering — the card is top-anchored so the pending-to-paid swap grows it
  // downward without moving anything already drawn (CLS budget 0.1).
  const contentClassName = 'space-y-6 px-5 py-5 text-center sm:px-6';
  const viewTestId =
    view.kind === 'pending'
      ? 'checkout-success-pending'
      : view.kind === 'recovery'
        ? 'checkout-success-recovery'
        : 'checkout-success-paid';

  return (
    <StandaloneProductPage
      width='lg'
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
          {view.kind === 'success' ? (
            <p
              className='mx-auto inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success-subtle px-2.5 py-1 text-xs font-medium text-success'
              data-testid='checkout-success-status'
            >
              <CircleCheck className='h-3.5 w-3.5' aria-hidden='true' />
              {view.paymentStatus === 'paid'
                ? 'Payment confirmed'
                : 'Checkout confirmed — no payment due'}
            </p>
          ) : (
            <div
              className={
                view.kind === 'pending'
                  ? 'mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-subtle bg-surface-2'
                  : 'mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-warning/20 bg-warning-subtle'
              }
              aria-live={view.kind === 'pending' ? 'polite' : undefined}
              aria-busy={view.kind === 'pending' ? true : undefined}
            >
              {view.kind === 'pending' ? (
                <Loader2
                  className='h-8 w-8 animate-spin text-secondary-token'
                  aria-hidden='true'
                />
              ) : (
                <XCircle className='h-8 w-8 text-warning' aria-hidden='true' />
              )}
            </div>
          )}

          {view.kind === 'success' && isArtistVisibilitySuccess ? (
            <div
              className='space-y-4'
              data-testid='artist-visibility-activation'
            >
              <p className='text-app font-semibold text-primary-token'>
                {ARTIST_VISIBILITY_ACTIVATION_COPY.status}
              </p>
              <CheckoutUnlockCards
                shareUrl={shareUrl}
                showFanListExport={!needsProfile}
                canNativeShare={canNativeShare}
                onNativeShare={handleNativeShare}
              />
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
                {checkoutSessionId ? (
                  <Button type='button' size='lg' onClick={retry}>
                    Check Again
                  </Button>
                ) : null}
                <Button asChild variant='secondary' size='lg'>
                  <Link href={APP_ROUTES.BILLING}>View Billing</Link>
                </Button>
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
                    href={getPaidSuccessPrimaryHref({
                      plan: view.plan,
                      isOnboardingUpgrade,
                      needsProfile,
                    })}
                  >
                    {getPaidSuccessPrimaryLabel({
                      plan: view.plan,
                      isOnboardingUpgrade,
                      needsProfile,
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
                <p className='text-xs text-tertiary-token'>
                  Your billing history and plan are on the{' '}
                  <Link
                    href={APP_ROUTES.BILLING}
                    className='underline underline-offset-2 hover:text-secondary-token'
                  >
                    Billing page
                  </Link>
                  .
                </p>
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
