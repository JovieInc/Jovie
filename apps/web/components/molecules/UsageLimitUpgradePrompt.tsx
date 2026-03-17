'use client';

import { Button } from '@jovie/ui';
import { Rocket } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';

interface UsageLimitUpgradePromptProps {
  /** Current usage count */
  readonly current: number;
  /** Maximum allowed by current plan */
  readonly limit: number;
  /** Feature name for display and tracking (e.g., "contacts", "AI messages") */
  readonly featureName: string;
  /** What the user unlocks by upgrading (e.g., "unlimited contacts", "100 messages/day") */
  readonly upgradeCopy: string;
  /** Optional custom CTA label. Defaults to "Upgrade to Pro" */
  readonly ctaLabel?: string;
  /** Optional className for the container */
  readonly className?: string;
}

/**
 * Reusable upgrade prompt shown when a user approaches or hits a plan limit.
 * Displays a progress bar, contextual message, and direct upgrade CTA.
 *
 * Shows at 80%+ of limit. Styles change at 100% (exhausted).
 */
export function UsageLimitUpgradePrompt({
  current,
  limit,
  featureName,
  upgradeCopy,
  ctaLabel = 'Upgrade to Pro',
  className,
}: UsageLimitUpgradePromptProps) {
  const hasTrackedRef = useRef(false);
  const percentage = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isAtLimit = current >= limit;
  const shouldShow = percentage >= 80;

  useEffect(() => {
    if (shouldShow && !hasTrackedRef.current) {
      track('usage_limit_upgrade_shown', {
        feature: featureName,
        current,
        limit,
        percentage: Math.round(percentage),
      });
      hasTrackedRef.current = true;
    }
  }, [shouldShow, featureName, current, limit, percentage]);

  if (!shouldShow) return null;

  const handleUpgradeClick = () => {
    track('usage_limit_upgrade_clicked', {
      feature: featureName,
      current,
      limit,
    });
  };

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        isAtLimit
          ? 'border-destructive/30 bg-destructive/5'
          : 'border-amber-500/30 bg-amber-500/5'
      } ${className ?? ''}`}
      role='alert'
    >
      {/* Progress bar */}
      <div className='mb-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2'>
        <div
          className={`h-full rounded-full transition-all ${
            isAtLimit ? 'bg-destructive' : 'bg-amber-500'
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-[13px] font-medium text-primary-token'>
            {isAtLimit
              ? `${featureName} limit reached`
              : `${current} of ${limit} ${featureName} used`}
          </p>
          <p className='mt-0.5 text-[12px] text-secondary-token'>
            Upgrade for {upgradeCopy}.
          </p>
        </div>

        <Button variant='secondary' size='sm' asChild className='shrink-0'>
          <a href={APP_ROUTES.PRICING} onClick={handleUpgradeClick}>
            <Rocket className='mr-1.5 h-3.5 w-3.5' />
            {ctaLabel}
          </a>
        </Button>
      </div>
    </div>
  );
}
