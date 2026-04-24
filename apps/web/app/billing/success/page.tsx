'use client';

import { Button } from '@jovie/ui';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { StandaloneProductPage } from '@/components/organisms/StandaloneProductPage';
import { APP_ROUTES } from '@/constants/routes';
import { page, track } from '@/lib/analytics';
import {
  ENTITLEMENT_REGISTRY,
  getAllPlanIds,
  type PlanId,
} from '@/lib/entitlements/registry';
import { useBillingStatusQuery } from '@/lib/queries';

type SuccessPlanKey = 'pro' | 'max';
type ResolvedSuccessPlan = SuccessPlanKey | 'generic';

const PAID_SUCCESS_PLAN_IDS: readonly SuccessPlanKey[] = ['pro', 'max'];
const GENERIC_UNLOCK_FEATURES = ENTITLEMENT_REGISTRY.pro.marketing.features;

function isKnownPlanId(value: string): value is PlanId {
  return (getAllPlanIds() as readonly string[]).includes(value);
}

function normalizeStripeSuccessPlan(
  planId: string | null
): SuccessPlanKey | 'invalid' | null {
  if (!planId) return null;
  if (!isKnownPlanId(planId)) return 'invalid';
  return PAID_SUCCESS_PLAN_IDS.includes(planId as SuccessPlanKey)
    ? (planId as SuccessPlanKey)
    : 'invalid';
}

function normalizeBillingPlan(
  plan: string | null | undefined
): SuccessPlanKey | null {
  if (plan === 'max' || plan === 'growth') return 'max';
  if (plan === 'pro' || plan === 'founding' || plan === 'trial') return 'pro';
  return null;
}

function getUnlockFeatures(plan: ResolvedSuccessPlan): readonly string[] {
  const source =
    plan === 'generic'
      ? GENERIC_UNLOCK_FEATURES
      : ENTITLEMENT_REGISTRY[plan].marketing.features;

  return source.filter(feature => !feature.trim().endsWith('+')).slice(0, 3);
}

function getSuccessHeading(plan: ResolvedSuccessPlan): string {
  if (plan === 'pro') return 'Welcome to Pro';
  if (plan === 'max') return 'Welcome to Max';
  return 'Welcome to your new plan';
}

function getSuccessSubtitle(plan: ResolvedSuccessPlan): string {
  if (plan === 'generic') {
    return 'Your upgrade is active. Here are a few things to try next.';
  }

  return ENTITLEMENT_REGISTRY[plan].marketing.tagline;
}

function SuccessFeatureTile({
  feature,
  index,
}: Readonly<{
  feature: string;
  index: number;
}>) {
  return (
    <ContentSurfaceCard
      surface='nested'
      className='flex min-h-28 flex-col gap-3 rounded-[14px] bg-surface-0 p-4 text-left'
    >
      <div className='flex h-9 w-9 items-center justify-center rounded-full border border-(--linear-app-shell-border) bg-surface-1 text-primary-token'>
        <CheckCircle2 className='h-4 w-4' aria-hidden='true' />
      </div>
      <div className='space-y-1'>
        <p className='text-2xs font-semibold tracking-[0.08em] text-tertiary-token'>
          Unlock {index + 1}
        </p>
        <p className='text-sm font-medium leading-5 text-primary-token'>
          {feature}
        </p>
      </div>
    </ContentSurfaceCard>
  );
}

function BillingSuccessSkeleton() {
  return (
    <ContentSurfaceCard
      surface='details'
      className='overflow-hidden'
      data-testid='billing-success-skeleton'
    >
      <div className='space-y-4 px-5 py-8 text-center sm:px-8 sm:py-10'>
        <div className='mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-(--linear-app-shell-border) bg-surface-0'>
          <div className='h-5 w-5 rounded-full skeleton motion-reduce:animate-none' />
        </div>
        <div className='space-y-2'>
          <LoadingSkeleton height='h-9' width='w-72' className='mx-auto' />
          <LoadingSkeleton height='h-4' width='w-80' className='mx-auto' />
        </div>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
          {Array.from({ length: 3 }, (_, index) => `success-tile-${index}`).map(
            key => (
              <ContentSurfaceCard
                key={key}
                surface='nested'
                className='space-y-3 rounded-[14px] bg-surface-0 p-4 text-left'
              >
                <div className='h-9 w-9 rounded-full skeleton motion-reduce:animate-none' />
                <LoadingSkeleton height='h-3' width='w-16' rounded='md' />
                <LoadingSkeleton height='h-4' width='w-full' rounded='md' />
              </ContentSurfaceCard>
            )
          )}
        </div>
      </div>
    </ContentSurfaceCard>
  );
}

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const sessionPlanHint = normalizeStripeSuccessPlan(
    searchParams.get('plan_id')
  );
  const shouldReduceMotion = useReducedMotion();
  const { data: billingData, status: billingStatus } = useBillingStatusQuery();
  const [resolvedPlan, setResolvedPlan] = useState<ResolvedSuccessPlan | null>(
    () => {
      if (sessionPlanHint === 'invalid') return 'generic';
      return sessionPlanHint;
    }
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
    if (resolvedPlan !== null) return;
    if (sessionPlanHint === 'invalid') {
      setResolvedPlan('generic');
      return;
    }
    if (sessionPlanHint) {
      setResolvedPlan(sessionPlanHint);
      return;
    }
    if (billingStatus === 'pending') return;

    setResolvedPlan(normalizeBillingPlan(billingData?.plan) ?? 'generic');
  }, [billingData?.plan, billingStatus, resolvedPlan, sessionPlanHint]);

  useEffect(() => {
    if (resolvedPlan === null) return;

    track('checkout_celebration_shown', {
      planType: resolvedPlan,
    });
  }, [resolvedPlan]);

  const unlockFeatures = useMemo(
    () => (resolvedPlan ? getUnlockFeatures(resolvedPlan) : []),
    [resolvedPlan]
  );

  if (resolvedPlan === null) {
    return (
      <StandaloneProductPage width='lg' centered>
        <BillingSuccessSkeleton />
      </StandaloneProductPage>
    );
  }

  return (
    <StandaloneProductPage
      width='lg'
      centered
      className='relative'
      contentClassName='relative z-10'
    >
      <motion.div
        initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          shouldReduceMotion
            ? undefined
            : { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
        }
      >
        <ContentSurfaceCard surface='details' className='overflow-hidden'>
          <div className='space-y-6 px-5 py-8 text-center sm:px-8 sm:py-10'>
            <div className='mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-(--linear-app-shell-border) bg-surface-0 text-primary-token'>
              <CheckCircle2 className='h-6 w-6' aria-hidden='true' />
            </div>

            <div className='space-y-2'>
              <h1 className='text-balance text-[32px] font-[620] tracking-[-0.045em] text-primary-token sm:text-[40px]'>
                {getSuccessHeading(resolvedPlan)}
              </h1>
              <p className='mx-auto max-w-2xl text-balance text-sm leading-6 text-secondary-token sm:text-[15px]'>
                {getSuccessSubtitle(resolvedPlan)}
              </p>
            </div>

            <div
              className='grid grid-cols-1 gap-3 text-left sm:grid-cols-3'
              data-testid='billing-success-tiles'
            >
              {unlockFeatures.map((feature, index) => (
                <SuccessFeatureTile
                  key={`${resolvedPlan}-${feature}`}
                  feature={feature}
                  index={index}
                />
              ))}
            </div>

            <div className='flex flex-col items-center justify-center gap-3 sm:flex-row'>
              <Button asChild size='lg'>
                <Link href={APP_ROUTES.CHAT}>
                  Open Chat
                  <ArrowRight className='h-4 w-4' aria-hidden='true' />
                </Link>
              </Button>
              <Button asChild variant='secondary' size='lg'>
                <Link href={APP_ROUTES.DASHBOARD_RELEASES}>View Releases</Link>
              </Button>
            </div>
          </div>
        </ContentSurfaceCard>
      </motion.div>
    </StandaloneProductPage>
  );
}
