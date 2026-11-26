'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { startTransition, useEffect, useRef } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  buildOnboardingCheckoutReturnHref,
  getOnboardingCheckoutReturnToast,
} from '@/lib/onboarding/checkout-return';

/**
 * Acknowledge Stripe onboarding checkout return (`upgrade=success|cancel`) once,
 * then strip checkout residue from the URL. Used on chat-first post-claim return
 * (and keep toast copy aligned with onboarding V2).
 */
export function useOnboardingCheckoutReturn(pathname: string): void {
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

    const toast = getOnboardingCheckoutReturnToast(upgradeStatus);
    if (toast?.tone === 'success') {
      notifications.success(toast.message);
    } else if (toast?.tone === 'info') {
      notifications.info(toast.message);
    }

    const href = buildOnboardingCheckoutReturnHref(
      pathname,
      searchParams.toString()
    );
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }, [notifications, pathname, router, searchParams]);
}
