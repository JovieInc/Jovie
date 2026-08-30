'use client';

import type { LucideIcon } from 'lucide-react';
import { AlarmClock, Bell, Clock, Sparkles } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InstallBanner } from '@/components/shell/InstallBanner';
import { APP_ROUTES, isDemoRoutePath } from '@/constants/routes';
import { track } from '@/lib/analytics';
import {
  formatVerifiedPriceLabel,
  getPreferredVerifiedPrice,
} from '@/lib/billing/verified-upgrade';
import { TRIAL_NOTIFICATION_RECIPIENT_LIMIT } from '@/lib/entitlements/registry';
import { env } from '@/lib/env-client';
import { useCheckoutMutation, usePricingOptionsQuery } from '@/lib/queries';
import { type NudgeState, usePlanGate } from '@/lib/queries/usePlanGate';

type Urgency = 'calm' | 'building' | 'high';

interface BannerVariant {
  state: NudgeState;
  icon: LucideIcon;
  headline: string;
  body: string;
  cta: string;
  urgency: Urgency;
  showPrice: boolean;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

const TRIAL_NOTIFICATION_CAP = TRIAL_NOTIFICATION_RECIPIENT_LIMIT;
// Warn at 80% of cap so the user feels the constraint coming.
const TRIAL_NOTIFICATION_WARNING_THRESHOLD = Math.floor(
  TRIAL_NOTIFICATION_CAP * 0.8
);
const DISMISSAL_KEY_PREFIX = 'jovie-sidebar-upgrade-dismissed';

function getDismissalKey(state: NudgeState): string {
  return `${DISMISSAL_KEY_PREFIX}:${state}`;
}

function buildVariant(input: {
  state: NudgeState;
  trialDaysRemaining: number | null;
  trialNotificationsSent: number;
}): BannerVariant | null {
  const { state, trialDaysRemaining, trialNotificationsSent } = input;

  switch (state) {
    case 'never_trialed':
      return {
        state,
        icon: Sparkles,
        headline: 'Try Pro free for 14 days',
        body: 'Fan notifications, verified, and more.',
        cta: 'Start trial',
        urgency: 'calm',
        showPrice: true,
      };

    case 'trial_late': {
      const days = trialDaysRemaining ?? 0;
      const capExhausted = trialNotificationsSent >= TRIAL_NOTIFICATION_CAP;
      const capWarning =
        trialNotificationsSent >= TRIAL_NOTIFICATION_WARNING_THRESHOLD;

      if (capExhausted) {
        return {
          state,
          icon: Bell,
          headline: 'Trial fan notifications paused',
          body: `You sent ${trialNotificationsSent} during trial. Lock in Pro to keep reaching fans.`,
          cta: 'Lock in Pro',
          urgency: 'high',
          showPrice: false,
        };
      }
      if (capWarning) {
        const remaining = TRIAL_NOTIFICATION_CAP - trialNotificationsSent;
        return {
          state,
          icon: Clock,
          headline: `${days} ${pluralize(days, 'day', 'days')} + ${remaining} fan notifications left`,
          body: 'Lock in Pro now to remove the trial cap.',
          cta: 'Lock in Pro',
          urgency: 'high',
          showPrice: false,
        };
      }
      return {
        state,
        icon: Clock,
        headline: `${days} ${pluralize(days, 'day', 'days')} left on Pro`,
        body: 'Lock in your plan to keep your fan notifications.',
        cta: 'Lock in Pro',
        urgency: 'building',
        showPrice: false,
      };
    }

    case 'trial_last_day': {
      const capExhausted = trialNotificationsSent >= TRIAL_NOTIFICATION_CAP;
      if (capExhausted) {
        return {
          state,
          icon: Bell,
          headline: 'Last day. Trial cap reached',
          body: `You sent ${trialNotificationsSent} fan notifications during trial. Lock in Pro to keep going.`,
          cta: 'Lock in Pro',
          urgency: 'high',
          showPrice: false,
        };
      }
      return {
        state,
        icon: AlarmClock,
        headline: 'Last day of Pro',
        body: 'Lock in your plan to keep notifications and the rest.',
        cta: 'Lock in Pro',
        urgency: 'high',
        showPrice: false,
      };
    }

    case 'recently_lapsed': {
      const n = trialNotificationsSent;
      if (n === 0) {
        return {
          state,
          icon: Bell,
          headline: 'Reclaim your Pro features',
          body: 'Your fans are still here. Reach them again with Pro.',
          cta: 'Reclaim Pro',
          urgency: 'high',
          showPrice: false,
        };
      }
      return {
        state,
        icon: Bell,
        headline: `You reached ${n} ${pluralize(n, 'fan', 'fans')} during trial`,
        body: 'Reclaim Pro to keep notifying them.',
        cta: 'Reclaim Pro',
        urgency: 'high',
        showPrice: false,
      };
    }

    case 'stale_lapsed':
      return {
        state,
        icon: Bell,
        headline: 'Your fans are still here',
        body: 'Get Pro to send release notifications again.',
        cta: 'Get Pro',
        urgency: 'calm',
        showPrice: false,
      };

    case 'trial_honeymoon':
    case 'pro_paid':
    case 'max_paid':
      return null;
  }
}

const ICON_TONE: Record<Urgency, string> = {
  calm: 'text-cyan-300/85',
  building: 'text-(--linear-accent)',
  high: 'text-(--linear-accent)',
};

export function SidebarUpgradeBanner() {
  const pathname = usePathname();
  const router = useRouter();
  // Only gate render on NODE_ENV=test (unit tests). IS_E2E mode (dev:local:browse,
  // playwright runs) needs the banner visible so we can verify it. The pricing
  // query keeps its own gate to skip the network call under test runtimes.
  const isPassiveRuntime = env.IS_TEST;
  const isDemoRoute = isDemoRoutePath(pathname);

  const planGate = usePlanGate();
  const pricing = usePricingOptionsQuery({
    enabled: !isPassiveRuntime && !isDemoRoute && !env.IS_E2E,
  });
  const checkoutMutation = useCheckoutMutation();
  const [dismissedState, setDismissedState] = useState<NudgeState | null>(null);

  const selectedPrice = useMemo(
    () => getPreferredVerifiedPrice(pricing.data?.options ?? []),
    [pricing.data?.options]
  );

  const priceLabel = useMemo(
    () => formatVerifiedPriceLabel(selectedPrice),
    [selectedPrice]
  );

  const variant = useMemo(
    () =>
      buildVariant({
        state: planGate.nudgeState,
        trialDaysRemaining: planGate.trialDaysRemaining,
        trialNotificationsSent: planGate.trialNotificationsSent,
      }),
    [
      planGate.nudgeState,
      planGate.trialDaysRemaining,
      planGate.trialNotificationsSent,
    ]
  );

  useEffect(() => {
    if (!variant) return;
    try {
      setDismissedState(
        sessionStorage.getItem(getDismissalKey(variant.state)) === 'true'
          ? variant.state
          : null
      );
    } catch {
      setDismissedState(null);
    }
  }, [variant]);

  // Fire impression once per state transition while the banner is mounted.
  const lastImpressionState = useRef<NudgeState | null>(null);
  useEffect(() => {
    if (!variant) return;
    if (dismissedState === variant.state) return;
    if (lastImpressionState.current === variant.state) return;
    lastImpressionState.current = variant.state;
    track('billing_upgrade_banner_impression', {
      surface: 'sidebar_upgrade_banner',
      state: variant.state,
    });
  }, [dismissedState, variant]);

  const handleUpgrade = useCallback(async () => {
    if (checkoutMutation.isPending || !variant) {
      return;
    }

    track('billing_upgrade_clicked', {
      surface: 'sidebar_upgrade_banner',
      placement: 'sidebar_bottom',
      state: variant.state,
    });

    if (!selectedPrice?.priceId) {
      router.push(APP_ROUTES.PRICING);
      return;
    }

    const checkout = await checkoutMutation.mutateAsync({
      priceId: selectedPrice.priceId,
    });

    track('billing_upgrade_checkout_redirected', {
      surface: 'sidebar_upgrade_banner',
      placement: 'sidebar_bottom',
      interval: selectedPrice.interval,
      state: variant.state,
    });

    globalThis.location.href = checkout.url;
  }, [checkoutMutation, router, selectedPrice, variant]);

  const handleDismiss = useCallback(() => {
    if (!variant) return;
    try {
      sessionStorage.setItem(getDismissalKey(variant.state), 'true');
    } catch {
      // Session storage may be unavailable in restricted browsers.
    }
    setDismissedState(variant.state);
    track('billing_upgrade_banner_dismissed', {
      surface: 'sidebar_upgrade_banner',
      state: variant.state,
    });
  }, [variant]);

  // isError → hide the banner. Otherwise paid Pro/Max users would see
  // "Try Pro free for 14 days" during a billing API outage because nudgeState
  // falls through to never_trialed when plan/trialEndsAt are unknown.
  if (
    isPassiveRuntime ||
    isDemoRoute ||
    planGate.isLoading ||
    planGate.isError ||
    !variant ||
    dismissedState === variant.state
  ) {
    return null;
  }

  const Icon = variant.icon;
  const title =
    variant.showPrice && priceLabel
      ? `${variant.headline} - ${priceLabel}`
      : variant.headline;

  return (
    <InstallBanner
      open
      icon={Icon}
      title={title}
      description={variant.body}
      ctaLabel={checkoutMutation.isPending ? 'Opening…' : variant.cta}
      ctaIcon={null}
      onCta={handleUpgrade}
      onDismiss={handleDismiss}
      ctaDisabled={checkoutMutation.isPending}
      iconClassName={ICON_TONE[variant.urgency]}
      className='group-data-[collapsible=icon]:hidden'
    />
  );
}
