'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { stripOnboardingCheckoutReturnParams } from '@/lib/onboarding/checkout-return';
import { useOnboardingCheckoutReturn } from '@/lib/onboarding/use-onboarding-checkout-return';
import { getResumeQueryValue, type StepId } from './onboardingV2Model';

/** Keeps the checkout-return toast and the `resume` query in sync. */
export function useOnboardingV2Url(currentStep: StepId) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useOnboardingCheckoutReturn(APP_ROUTES.ONBOARDING);

  useEffect(() => {
    const currentQueryString = searchParams.toString();
    const resumeValue = getResumeQueryValue(currentStep);
    const params = stripOnboardingCheckoutReturnParams(currentQueryString);

    if (resumeValue) {
      params.set('resume', resumeValue);
    } else {
      params.delete('resume');
    }

    const nextQueryString = params.toString();
    if (nextQueryString === currentQueryString) {
      return;
    }

    startTransition(() => {
      router.replace(
        nextQueryString
          ? `${APP_ROUTES.ONBOARDING}?${nextQueryString}`
          : APP_ROUTES.ONBOARDING,
        { scroll: false }
      );
    });
  }, [currentStep, router, searchParams]);
}
