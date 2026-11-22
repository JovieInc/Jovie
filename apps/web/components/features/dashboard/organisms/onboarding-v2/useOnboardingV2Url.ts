'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect, useRef } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { getResumeQueryValue, type StepId } from './onboardingV2Model';

/** Keeps the checkout-return toast and the `resume` query in sync. */
export function useOnboardingV2Url(currentStep: StepId) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notifications = useNotifications();
  const handledUpgradeStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const upgradeStatus = searchParams.get('upgrade');
    if (!upgradeStatus || handledUpgradeStatusRef.current === upgradeStatus) {
      return;
    }

    handledUpgradeStatusRef.current = upgradeStatus;

    if (upgradeStatus === 'cancel') {
      notifications.info('Checkout cancelled. You can keep going for free.');
    } else if (upgradeStatus === 'success') {
      notifications.success('Upgrade complete.');
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('upgrade');

    const nextQueryString = params.toString();
    startTransition(() => {
      router.replace(
        nextQueryString
          ? `${APP_ROUTES.ONBOARDING}?${nextQueryString}`
          : APP_ROUTES.ONBOARDING,
        { scroll: false }
      );
    });
  }, [notifications, router, searchParams]);

  useEffect(() => {
    const currentQueryString = searchParams.toString();
    const resumeValue = getResumeQueryValue(currentStep);
    const params = new URLSearchParams(currentQueryString);
    params.delete('upgrade');

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
