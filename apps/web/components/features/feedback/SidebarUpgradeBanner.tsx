'use client';

import type { LucideIcon } from 'lucide-react';
import { AlarmClock, Bell, Clock, Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { isDemoRoutePath } from '@/constants/routes';
import { track } from '@/lib/analytics';
import {
  formatVerifiedPriceLabel,
  getPreferredVerifiedPrice,
} from '@/lib/billing/verified-upgrade';
import { env } from '@/lib/env-client';
import { useCheckoutMutation, usePricingOptionsQuery } from '@/lib/queries';
import { type NudgeState, usePlanGate } from '@/lib/queries/usePlanGate';
import { cn } from '@/lib/utils';

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

const TRIAL_NOTIFICATION_CAP = 50;
const TRIAL_NOTIFICATION_WARNING_THRESHOLD = 40;

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

const URGENCY_CLASSES: Record<Urgency, string> = {
  calm: 'border-sidebar-border/70 bg-sidebar-accent/12',
  building: 'border-(--linear-accent)/30 bg-(--linear-accent)/5',
  high: 'border-(--linear-accent)/50 bg-(--linear-accent)/8',
};

const TEXT_TONE: Record<Urgency, string> = {
  calm: 'text-sidebar-item-foreground/75',
  building: 'text-sidebar-item-foreground',
  high: 'text-sidebar-item-foreground',
};

export function SidebarUpgradeBanner() {
  const pathname = usePathname();
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

  // Fire impression once per state transition while the banner is mounted.
  const lastImpressionState = useRef<NudgeState | null>(null);
  useEffect(() => {
    if (!variant) return;
    if (lastImpressionState.current === variant.state) return;
    lastImpressionState.current = variant.state;
    track('billing_upgrade_banner_impression', {
      surface: 'sidebar_upgrade_banner',
      state: variant.state,
    });
  }, [variant]);

  const handleUpgrade = useCallback(async () => {
    if (!selectedPrice?.priceId || checkoutMutation.isPending || !variant) {
      return;
    }

    track('billing_upgrade_clicked', {
      surface: 'sidebar_upgrade_banner',
      placement: 'sidebar_bottom',
      state: variant.state,
    });

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
  }, [checkoutMutation, selectedPrice, variant]);

  if (isPassiveRuntime || isDemoRoute || planGate.isLoading || !variant) {
    return null;
  }

  const Icon = variant.icon;

  return (
    <div className='group-data-[collapsible=icon]:hidden px-2.5 pb-1.5'>
      <div
        className={cn(
          'rounded-xl border px-2.5 py-2 text-sidebar-muted',
          URGENCY_CLASSES[variant.urgency]
        )}
      >
        <div className='flex items-start gap-1.5'>
          <Icon
            className={cn(
              'mt-0.5 size-3 shrink-0',
              variant.urgency === 'calm'
                ? 'text-sidebar-item-icon/60'
                : 'text-(--linear-accent)'
            )}
          />
          <div className='min-w-0'>
            <p
              className={cn(
                'text-2xs font-medium tracking-[-0.01em]',
                TEXT_TONE[variant.urgency]
              )}
            >
              {variant.headline}
              {variant.showPrice && priceLabel ? ` — ${priceLabel}` : null}
            </p>
            <p className='mt-0.5 text-[10px] leading-[1.35] text-sidebar-muted/80'>
              {variant.body}
            </p>
            <button
              type='button'
              onClick={() => handleUpgrade()}
              disabled={!selectedPrice?.priceId || checkoutMutation.isPending}
              className='mt-1 inline-flex min-h-6 items-center rounded-full bg-transparent px-1.5 text-[10px] font-medium text-sidebar-item-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:cursor-not-allowed disabled:opacity-60'
            >
              {checkoutMutation.isPending ? 'Opening…' : variant.cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
